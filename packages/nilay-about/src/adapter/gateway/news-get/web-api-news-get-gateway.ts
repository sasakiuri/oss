import { News } from "../../../domain/model"
import { Request, Response, NewsGetGateway } from "../../../use-case/news-get"
import firebase from "gatsby-plugin-firebase"

export class WebApiNewsGetGateway implements NewsGetGateway {
  async read(request: Request): Promise<Response> {
    try {

      const firestore: firebase.firestore.Firestore = firebase.firestore()
      const reference: firebase.firestore.DocumentReference<firebase.firestore.DocumentData> = firestore
        .collection("news")
        .doc(request.id)
      const snapshot: firebase.firestore.DocumentSnapshot<firebase.firestore.DocumentData> = await reference.get()

      const news: News = {
        id: snapshot.id,
        title: snapshot.get("title"),
        date: snapshot.get("date").toDate(),
        summary: snapshot.get("message"),
      }

      return { news: news }
    } catch (ex) {
      throw ex
    }
  }
}
