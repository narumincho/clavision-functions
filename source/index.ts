import * as functions from "firebase-functions";

export const api = functions
  .region("asia-northeast1")
  .https.onRequest((request, response) => {
    response.send("api");
  });
