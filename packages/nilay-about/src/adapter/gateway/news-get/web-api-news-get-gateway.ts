import { News } from "../../../domain/model"
import { Request, Response, NewsGetGateway } from "../../../use-case/news-get"
import * as firebase from "firebase/app";
import "firebase/firestore";
import "firebase/analytics";

export class WebApiNewsGetGateway implements NewsGetGateway {
  async read(request: Request): Promise<Response> {
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
      const reference: firebase.firestore.DocumentReference<firebase.firestore.DocumentData> = firestore
        .collection("news")
        .doc(request.id);
      const snapshot: firebase.firestore.DocumentSnapshot<firebase.firestore.DocumentData> = await reference.get();

      const news: News = {
        id: snapshot.id,
        title: snapshot.get("title"),
        date: snapshot.get("date").toDate(),
        summary: snapshot.get("message")
      };

      return { news: news };
    } catch (ex) {
      throw ex;
    }
  }
}