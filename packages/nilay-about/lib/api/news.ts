import {
  collection,
  doc,
  getDocs,
  getDoc,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase";
import type { News, NewsListResponse, NewsGetResponse } from "@/lib/schemas";

export async function fetchNewsList(): Promise<NewsListResponse> {
  const db = getFirestoreDb();
  const newsCollection = collection(db, "news");
  const q = query(newsCollection, orderBy("date", "desc"));
  const snapshot = await getDocs(q);

  const newsList: News[] = snapshot.docs.map((docSnapshot) => {
    const data = docSnapshot.data();
    const timestamp = data.date as Timestamp;

    return {
      id: docSnapshot.id,
      title: data.title as string,
      date: timestamp.toDate(),
      summary: data.message as string,
    };
  });

  return { newsList };
}

export async function fetchNewsById(id: string): Promise<NewsGetResponse> {
  const db = getFirestoreDb();
  const docRef = doc(db, "news", id);
  const docSnapshot = await getDoc(docRef);

  if (!docSnapshot.exists()) {
    throw new Error("News not found");
  }

  const data = docSnapshot.data();
  const timestamp = data.date as Timestamp;

  const news: News = {
    id: docSnapshot.id,
    title: data.title as string,
    date: timestamp.toDate(),
    summary: data.message as string,
  };

  return { news };
}
