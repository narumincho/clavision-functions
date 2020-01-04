import * as functions from "firebase-functions";
import * as expressGraphQL from "express-graphql";
import * as schema from "./schema";
import * as data from "./data";
import * as database from "./database";

/* =====================================================================
 *                          API (GraphQL)
 *     https://asia-northeast1-clavision.cloudfunctions.net/indexHtml
 * =====================================================================
 */

export const api = functions
  .region("asia-northeast1")
  .https.onRequest((request, response) => {
    response.setHeader(
      "access-control-allow-origin",
      "https://clavision.web.app/"
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
 *   https://asia-northeast1-clavision.cloudfunctions.net/lineLoginCallback
 * =====================================================================
 */
export const lineLoginCallback = functions
  .region("asia-northeast1")
  .https.onRequest(async (request, response) => {
    const query: { code: unknown; state: unknown } = request.query;
    response.send("loginCallBack is WIP");
  });

/* =====================================================================
 *                 File バイナリファイルを欲しいときに利用する
 *      https://asia-northeast1-clavision.cloudfunctions.net/file
 * =====================================================================
 */
export const file = functions.https.onRequest(async (request, response) => {
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
