import { NotFoundError, NetworkError, ExternalServiceError } from "@/lib/errors";
import { newsListResponseSchema, newsGetResponseSchema } from "@/lib/schemas";
import type { NewsListResponse, NewsGetResponse } from "@/lib/schemas";
import type { NewsRepository } from "./types";
import { validateResponse } from "./validation";

/**
 * Get base URL for API calls
 *
 * - Client-side: use relative path (empty string)
 * - Server-side: use NEXT_PUBLIC_SITE_URL (required in production)
 *
 * NOTE: 本番環境では NEXT_PUBLIC_SITE_URL が必須です。
 * 未設定の場合、lib/env.ts の検証で起動時にエラーになります。
 */
function getBaseUrl(): string {
  // Client-side: use relative path
  if (typeof window !== "undefined") {
    return "";
  }

  // Server-side: lib/env.ts が本番環境では NEXT_PUBLIC_SITE_URL を必須としているため、
  // ここでは process.env を直接参照して安全にフォールバック
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (siteUrl) {
    return siteUrl;
  }

  // 開発環境のフォールバック
  if (process.env.NODE_ENV !== "production") {
    return "http://localhost:3000";
  }

  // 本番環境で NEXT_PUBLIC_SITE_URL が未設定の場合は即座にエラー
  // （lib/env.ts のチェックをすり抜けた場合のセーフガード）
  throw new Error(
    "[news] CRITICAL: NEXT_PUBLIC_SITE_URL is not set in production. " +
    "SSR/Server Components からの API 呼び出しには絶対 URL が必要です。"
  );
}

/**
 * API経由でニュースを取得するリポジトリ
 * クライアントコンポーネントから使用可能
 */
class ApiNewsRepository implements NewsRepository {
  private baseUrl: string;

  constructor() {
    this.baseUrl = getBaseUrl();
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
