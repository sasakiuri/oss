import { News } from "../../../domain/model"
import { Response, NewsListGateway } from "../../../use-case/news-list"
import * as firebase from "firebase/app";
import "firebase/firestore";
import "firebase/analytics";

export class WebApiNewsListGateway implements NewsListGateway {
  async read(): Promise<Response> {
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

      const firestore: firebase.firestore.Firestore = firebase.firestore();
      const snapshot: firebase.firestore.QuerySnapshot<firebase.firestore.DocumentData> = await firestore
        .collection("news")
        .orderBy("date", "desc")
        .get();

      const data: Array<News> = snapshot.docs.map(
        (doc: firebase.firestore.DocumentData) => {
          return {
            id: doc.id,
            title: doc.get("title"),
            date: doc.get("date").toDate(),
            summary: doc.get("message")
          };
        }
      );

      return { newsList: data };
    } catch (ex) {
      throw ex;
    }
  }
}