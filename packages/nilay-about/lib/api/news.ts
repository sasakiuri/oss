import { NotFoundError, NetworkError, ExternalServiceError } from "@/lib/errors";
import { newsListResponseSchema, newsGetResponseSchema } from "@/lib/schemas";
import type { NewsListResponse, NewsGetResponse } from "@/lib/schemas";
import type { NewsRepository } from "./types";
import { validateResponse } from "./validation";

/**
 * API経由でニュースを取得するリポジトリ
 * クライアントコンポーネントから使用可能
 */
class ApiNewsRepository implements NewsRepository {
  private baseUrl: string;

  constructor() {
    this.baseUrl = typeof window !== "undefined" ? "" : process.env.NEXT_PUBLIC_SITE_URL || "";
  }

  async findAll(): Promise<NewsListResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/api/news`, {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new ExternalServiceError(
          "API",
          `Failed to fetch news list: ${response.status}`,
          undefined
        );
      }

      const data = await response.json();
      return validateResponse(newsListResponseSchema, data, "news list");
    } catch (error) {
      if (
        error instanceof NotFoundError ||
        error instanceof NetworkError ||
        error instanceof ExternalServiceError
      ) {
        throw error;
      }
      if (error instanceof TypeError && error.message.includes("fetch")) {
        throw new NetworkError("Failed to connect to API", undefined, undefined, error);
      }
      throw new ExternalServiceError("API", "Unknown error fetching news list", error);
    }
  }

  async findById(id: string): Promise<NewsGetResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/api/news/${id}`, {
        cache: "no-store",
      });

      if (response.status === 404) {
        throw new NotFoundError("News", id);
      }

      if (!response.ok) {
        throw new ExternalServiceError(
          "API",
          `Failed to fetch news: ${response.status}`,
          undefined
        );
      }

      const data = await response.json();
      return validateResponse(newsGetResponseSchema, data, `news ${id}`);
    } catch (error) {
      if (
        error instanceof NotFoundError ||
        error instanceof NetworkError ||
        error instanceof ExternalServiceError
      ) {
        throw error;
      }
      if (error instanceof TypeError && error.message.includes("fetch")) {
        throw new NetworkError("Failed to connect to API", undefined, undefined, error);
      }
      throw new ExternalServiceError("API", `Unknown error fetching news ${id}`, error);
    }
  }
}

// Singleton instance
const newsRepository = new ApiNewsRepository();

// Public API functions (facade pattern)
export async function fetchNewsList(): Promise<NewsListResponse> {
  return newsRepository.findAll();
}

export async function fetchNewsById(id: string): Promise<NewsGetResponse> {
  return newsRepository.findById(id);
}

// Export for DI
export { newsRepository, ApiNewsRepository };
