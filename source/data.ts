import * as functions from "firebase-functions";
import { URL } from "url";

const encodeURIComponentRFC3986 = (text: string): string =>
  encodeURIComponent(text)
    .replace(/!/g, "%21")
    .replace(/\*/g, "%2A")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");

const mapToUrlEncodeMap = (map: Map<string, string>): string =>
  [...map.entries()]
    .map(
      ([key, value]) =>
        encodeURIComponentRFC3986(key) + "=" + encodeURIComponentRFC3986(value)
    )
    .join("&");

/**
 * URLを構成するパーツから組み立てる
 * @param hostName サーバの名前 narumincho.com や us-central1-definy-lang.cloudfunctions.net など
 * @param path サーバに送信される 場所のようなもの /user/abc は ["user", "abc"] になる
 * @param query サーバに送信されるパラメーター
 * @param fragment リダイレクト時にサーバに送信されないパラメーター。本来はパラメーターではないがキーと値を持てるようにした
 */
export const urlFrom = (
  hostName: string,
  path: Array<string>,
  query: Map<string, string>,
  fragment: Map<string, string>
): URL => {
  return new URL(
    "https://" +
      hostName +
      (path.length === 0 ? "" : "/" + path.map(encodeURIComponent).join("/")) +
      (query.size === 0 ? "" : "?" + mapToUrlEncodeMap(query)) +
      (fragment.size === 0 ? "" : "#" + mapToUrlEncodeMap(fragment))
  );
};

export const appHostName = "clavision.web.app";

export const appHttpsSchemeAndHostName = "https://" + appHostName;

export const lineLoginRedirectUri =
  "https://us-central1-clavision.cloudfunctions.net/lineLoginCallback";

export const lineLoginClientId = "1653666685";

export const lineLoginChannelSecret: string = functions.config()["line-login"][
  "channel-secret"
];
