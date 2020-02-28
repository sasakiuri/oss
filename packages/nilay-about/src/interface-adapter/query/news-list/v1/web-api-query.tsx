import Response from "../../../../use-case/news-list/v1/response"
import Query from "../../../../use-case/news-list/v1/query"
import News from "../../../../use-case/news-list/v1/news"
import axios from "axios"
import * as firebase from "firebase";

interface ApiNews {
    id: string
    title: string
    datetime: string
    body: string
}

class WebApiQuery implements Query {

    public async handle(): Promise<Response> {

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

            // const res = await axios.get("https://jq9dz9fa6d.execute-api.ap-northeast-1.amazonaws.com/v1/news/")
            // const items: Array<ApiNews> = res.data

            // const newsList: Array<News> = items.map((value: ApiNews) => {
            //     return { id: value.id, title: value.title, date: new Date(value.datetime), summary: value.body }
            // });

            const firestore: firebase.firestore.Firestore = firebase.firestore();

            const snapshot: firebase.firestore.QuerySnapshot<firebase.firestore.DocumentData> = await firestore.collection("news").orderBy("date", "desc").get();
            const data: Array<any> = snapshot.docs.map((doc: firebase.firestore.DocumentData) => {
                return { id: doc.id, title: doc.get("title"), date: doc.get("date").toDate(), summary: doc.get("message") };
            });

            return { newsList: data }

        } catch (ex) {

            throw ex
        }
    }
}

export default WebApiQuery