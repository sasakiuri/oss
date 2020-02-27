import Response from "../../../../use-case/contact-message-send/v1/response";
import Request from "../../../../use-case/contact-message-send/v1/request";
import Query from "../../../../use-case/contact-message-send/v1/query";
import axios, { AxiosInstance, AxiosRequestConfig } from "axios";
import * as firebase from "firebase";

type AxiosConfig = AxiosRequestConfig & {
  baseURL: string;
}


class WebApiQuery implements Query {
  public async write(req: Request): Promise<Response> {
    try {
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

      const sendContactMessage: firebase.functions.HttpsCallable = firebase.functions().httpsCallable("sendContactMessage");

      const result = await sendContactMessage(req);
      console.log(result);

      const data: Response = {
        hasError: result.data.hasError,
        errorMessage: result.data.errorMessage,
        uuid: result.data.uuid
      };

      // const config: AxiosConfig = { baseURL: "https://us-central1-nilay-about.cloudfunctions.net" };
      // const client: AxiosInstance = axios.create(config);
      // const ress = await client.post<Response>("/sendContactMessage", req);


      // const apiRes = await axios.get("https://us-central1-nilay-about.cloudfunctions.net/sendContactMessage");
      // console.log(ress, apiRes);

      return data;


    } catch (ex) {
      console.log(ex);
      throw ex;
    }
  }
}

export default WebApiQuery;
