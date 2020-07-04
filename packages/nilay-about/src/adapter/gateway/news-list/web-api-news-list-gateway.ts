import { News } from "../../../domain/model"
import { Response, NewsListGateway } from "../../../use-case/news-list"
import firebase from "gatsby-plugin-firebase"

export class WebApiNewsListGateway implements NewsListGateway {
  async read(): Promise<Response> {
    try {
      const firestore: firebase.firestore.Firestore = firebase.firestore()
      const snapshot: firebase.firestore.QuerySnapshot<firebase.firestore.DocumentData> = await firestore
        .collection("news")
        .orderBy("date", "desc")
        .get()

      const data: Array<News> = snapshot.docs.map(
        (doc: firebase.firestore.DocumentData) => {
          return {
            id: doc.id,
            title: doc.get("title"),
            date: doc.get("date").toDate(),
            summary: doc.get("message"),
          }
        }
      )

      return { newsList: data }
    } catch (ex) {
      throw ex
    }
  }
}
