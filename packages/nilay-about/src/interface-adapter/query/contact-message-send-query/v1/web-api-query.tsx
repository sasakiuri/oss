import Response from "../../../../use-case/contact-message-send/v1/response";
import Request from "../../../../use-case/contact-message-send/v1/request";
import Query from "../../../../use-case/contact-message-send/v1/query";
import * as firebase from "firebase/app";
import "firebase/functions";
import "firebase/analytics";

class WebApiQuery implements Query {

  public async write(req: Request): Promise<Response> {

    try {

      if (!firebase.apps.length) {
        firebase.initializeApp({
          apiKey: "REDACTED_FIREBASE_API_KEY",
          authDomain: "nilay-about.firebaseapp.com",
          databaseURL: "https://nilay-about.firebaseio.com",
          projectId: "nilay-about",
          storageBucket: "nilay-about.appspot.com",
          messagingSenderId: "501712650959",
          appId: "1:501712650959:web:191a29b977cad3f2472dba",
          measurementId: "G-C3KJX5WQEM"
        });
        firebase.analytics();
      }

      const sendContactMessage: firebase.functions.HttpsCallable = firebase
        .functions()
        .httpsCallable("sendContactMessage");

      const result = await sendContactMessage(req);

      const data: Response = {
        hasError: result.data.hasError,
        errorMessage: result.data.errorMessage,
        uuid: result.data.uuid
      };

      return data;

    } catch (ex) {

      throw ex;
    }
  }
}

export default WebApiQuery;
