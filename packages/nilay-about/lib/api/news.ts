import {
  collection,
  doc,
  getDocs,
  getDoc,
  orderBy,
  query,
  Timestamp,
  type DocumentData,
  FirestoreError,
} from "firebase/firestore";
import { getFirestoreDb } from "@/lib/firebase";
import { NotFoundError, NetworkError, ExternalServiceError } from "@/lib/errors";
import { newsSchema, newsListResponseSchema, newsGetResponseSchema } from "@/lib/schemas";
import type { News, NewsListResponse, NewsGetResponse } from "@/lib/schemas";
import type { NewsRepository } from "./types";
import { validateResponse } from "./validation";

/**
 * Map Firestore error to domain error
 */
function handleFirestoreError(error: unknown, operation: string): never {
  if (error instanceof FirestoreError) {
    switch (error.code) {
      case "unavailable":
      case "deadline-exceeded":
        throw new NetworkError(`Firestore ${operation} failed: network unavailable`, error);
      case "permission-denied":
        throw new ExternalServiceError("Firestore", `Permission denied for ${operation}`, error);
      default:
        throw new ExternalServiceError("Firestore", `${operation} failed: ${error.message}`, error);
    }
  }
  throw new ExternalServiceError("Firestore", `Unknown error during ${operation}`, error);
}

/**
 * Firestoreドキュメントからニュースエンティティを変換
 * Zodスキーマでランタイムバリデーションを実行
 */
function mapDocumentToNews(id: string, data: DocumentData): News {
  const timestamp = data.date as Timestamp;
  const rawNews = {
    id,
    title: data.title,
    date: timestamp?.toDate?.() ?? new Date(),
    summary: data.message,
  };

  return validateResponse(newsSchema, rawNews, `news document ${id}`);
}

/**
 * Firestore実装のニュースリポジトリ
 */
class FirestoreNewsRepository implements NewsRepository {
  async findAll(): Promise<NewsListResponse> {
    try {
      const db = getFirestoreDb();
      const newsCollection = collection(db, "news");
      const q = query(newsCollection, orderBy("date", "desc"));
      const snapshot = await getDocs(q);

      const newsList: News[] = snapshot.docs.map((docSnapshot) =>
        mapDocumentToNews(docSnapshot.id, docSnapshot.data())
      );

      return validateResponse(newsListResponseSchema, { newsList }, "news list");
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof NetworkError || error instanceof ExternalServiceError) {
        throw error;
      }
      handleFirestoreError(error, "findAll");
    }
  }

  async findById(id: string): Promise<NewsGetResponse> {
    try {
      const db = getFirestoreDb();
      const docRef = doc(db, "news", id);
      const docSnapshot = await getDoc(docRef);

      if (!docSnapshot.exists()) {
        throw new NotFoundError("News", id);
      }

      const news = mapDocumentToNews(docSnapshot.id, docSnapshot.data());
      return validateResponse(newsGetResponseSchema, { news }, `news ${id}`);
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof NetworkError || error instanceof ExternalServiceError) {
        throw error;
      }
      handleFirestoreError(error, `findById(${id})`);
    }
  }
}

// Singleton instance
const newsRepository = new FirestoreNewsRepository();

// Public API functions (facade pattern for backward compatibility)
export async function fetchNewsList(): Promise<NewsListResponse> {
  return newsRepository.findAll();
}

export async function fetchNewsById(id: string): Promise<NewsGetResponse> {
  return newsRepository.findById(id);
}

// Export for testing and DI
export { newsRepository, FirestoreNewsRepository };
export type { NewsRepository };
