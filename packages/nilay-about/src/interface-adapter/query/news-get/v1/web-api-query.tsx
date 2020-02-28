import Response from "../../../../use-case/news-get/v1/response";
import Request from "../../../../use-case/news-get/v1/request";
import Query from "../../../../use-case/news-get/v1/query";
import axios from "axios";
import * as firebase from "firebase";

interface ApiNews {
  id: string;
  title: string;
  datetime: string;
  body: string;
}

class WebApiQuery implements Query {
  public async handle(request: Request): Promise<Response> {

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


    try {

      const firestore: firebase.firestore.Firestore = firebase.firestore();
      const reference: firebase.firestore.DocumentReference<firebase.firestore.DocumentData> = firestore.collection("news").doc(request.id);
      const snapshot: firebase.firestore.DocumentSnapshot<firebase.firestore.DocumentData> = await reference.get();

      return {
        news: {
          id: snapshot.id,
          title: snapshot.get("title"),
          date: snapshot.get("date").toDate(),
          summary: snapshot.get("message")
        }
      };
      // const res = await axios.get(
      //   `https://jq9dz9fa6d.execute-api.ap-northeast-1.amazonaws.com/v1/news/${request.id}`
      // );
      // const item: ApiNews = res.data;

      // return {
      //   news: {
      //     id: item.id,
      //     title: item.title,
      //     date: new Date(item.datetime),
      //     summary: item.body
      //   }
      // };
    } catch (ex) {
      throw ex;
    }
  }
}

export default WebApiQuery;
