import * as functions from "firebase-functions";
import * as expressGraphQL from "express-graphql";
import * as schema from "./schema";
import * as data from "./data";
import * as database from "./database";
import { URL, URLSearchParams } from "url";
import * as jsonWebToken from "jsonwebtoken";
import axios, { AxiosResponse } from "axios";

/* =====================================================================
 *                          API (GraphQL)
 *     https://us-central1-clavision.cloudfunctions.net/indexHtml
 * =====================================================================
 */

export const api = functions
  .region("us-central1")
  .https.onRequest((request, response) => {
    response.setHeader(
      "access-control-allow-origin",
      data.appHttpsSchemeAndHostName
    );
    response.setHeader("vary", "Origin");
    if (request.method === "OPTIONS") {
      response.setHeader("access-control-allow-methods", "POST, GET, OPTIONS");
      response.setHeader("access-control-allow-headers", "content-type");
      response.status(200).send("");
      return;
    }
    expressGraphQL({ schema: schema.schema, graphiql: true })(
      request,
      response
    );
  });

/* =====================================================================
 *              ソーシャルログインをしたあとのリダイレクト先
 *   https://us-central1-clavision.cloudfunctions.net/lineLoginCallback
 * =====================================================================
 */
const createAccessTokenUrl = (accessToken: string): URL =>
  data.urlFrom(
    data.appHostName,
    [],
    new Map(),
    new Map([["accessToken", accessToken]])
  );

const verifyAccessTokenAndGetData = (
  idToken: string
): Promise<{
  iss: "https://access.line.me";
  sub: database.LineUserId;
  name: string;
  picture: URL;
}> =>
  new Promise((resolve, reject) => {
    jsonWebToken.verify(
      idToken,
      data.lineLoginChannelSecret,
      {
        algorithms: ["HS256"]
      },
      (error, decoded) => {
        if (error) {
          console.log("lineTokenの正当性チェックで正当でないと判断された!");
          reject("token invalid!");
          return;
        }
        const decodedData = decoded as {
          iss: unknown;
          sub: unknown;
          name: unknown;
          picture: unknown;
        };
        if (
          decodedData.iss !== "https://access.line.me" ||
          typeof decodedData.name !== "string" ||
          typeof decodedData.sub !== "string" ||
          typeof decodedData.picture !== "string"
        ) {
          console.log("lineのidTokenに含まれているデータの型が違かった");
          reject("token data is invalid!");
          return;
        }
        resolve({
          iss: decodedData.iss,
          name: decodedData.name,
          sub: decodedData.sub as database.LineUserId,
          picture: new URL(decodedData.picture)
        });
      }
    );
  });

export const lineLoginCallback = functions
  .region("us-central1")
  .https.onRequest(async (request, response) => {
    const query: { code: unknown; state: unknown } = request.query;
    if (typeof query.code !== "string" || typeof query.state !== "string") {
      response.redirect(data.appHttpsSchemeAndHostName);
      return;
    }
    if (!(await database.checkExistsAndDeleteState(query.state))) {
      response
        .status(400)
        .send(
          `LINE LogIn Error: Definy dose not generate state (${query.state})`
        );
      return;
    }
    // ここで https://api.line.me/oauth2/v2.1/token にqueryのcodeをつけて送信。IDトークンを取得する
    const idToken = ((await axios.post(
      "https://api.line.me/oauth2/v2.1/token",
      new URLSearchParams(
        new Map([
          ["grant_type", "authorization_code"],
          ["code", query.code],
          ["redirect_uri", data.lineLoginRedirectUri],
          ["client_id", data.lineLoginClientId],
          ["client_secret", data.lineLoginChannelSecret]
        ])
      ).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    )) as AxiosResponse<{ id_token: string }>).data.id_token;
    const lineData = await verifyAccessTokenAndGetData(idToken);
    const userData = await database.getUserFromLineAccountId(lineData.sub);
    // ユーザーが存在しなかったので新しく作る
    if (userData === null) {
      const accessToken = await database.createUser(
        lineData.name,
        lineData.picture,
        lineData.sub
      );
      response.redirect(createAccessTokenUrl(accessToken).toString());
      return;
    }
    // ユーザーが存在したのでアクセストークンを再発行して返す
    response.redirect(
      createAccessTokenUrl(
        await database.updateAccessToken(userData.id)
      ).toString()
    );
  });

/* =====================================================================
 *                 File バイナリファイルを欲しいときに利用する
 *      https://us-central1-clavision.cloudfunctions.net/file
 * =====================================================================
 */
export const file = functions
  .region("us-central1")
  .https.onRequest(async (request, response) => {
    response.setHeader(
      "access-control-allow-origin",
      data.appHttpsSchemeAndHostName
    );
    response.setHeader("vary", "Origin");
    if (request.method === "OPTIONS") {
      response.setHeader("access-control-allow-methods", "POST, GET, OPTIONS");
      response.setHeader("access-control-allow-headers", "content-type");
      response.status(200).send("");
      return;
    }
    if (request.method === "GET") {
      response.setHeader("cache-control", "public, max-age=31536000");
      database
        .getReadableStream(schema.parseFileHash(request.path.slice(1)))
        .pipe(response);
      return;
    }
    response.status(400).send("invalid file parameter");
  });
