import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { newsListResponseSchema } from "@/lib/schemas";
import { createRequestLogger } from "@/lib/logging";
import {
  checkRateLimit,
  getClientIp,
  rateLimitPresets,
} from "@/lib/api/rate-limit";

/** ページネーションのデフォルト値 */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/** クエリパラメータのスキーマ */
const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional().default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).optional().default(0),
});

export async function GET(request: NextRequest) {
  const log = createRequestLogger(request);

  try {
    // Rate limiting check
    const clientIp = getClientIp(request);
    const rateLimit = await checkRateLimit(clientIp, rateLimitPresets.apiRead);

    if (!rateLimit.allowed) {
      log.warn("Rate limit exceeded", { clientIp, resetIn: rateLimit.resetIn });
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil(rateLimit.resetIn / 1000)),
            "X-RateLimit-Remaining": String(rateLimit.remaining),
          },
        }
      );
    }

    // クエリパラメータのバリデーション
    const searchParams = request.nextUrl.searchParams;
    const queryResult = querySchema.safeParse({
      limit: searchParams.get("limit"),
      offset: searchParams.get("offset"),
    });

    if (!queryResult.success) {
      log.warn("Invalid query parameters", {
        errors: queryResult.error.flatten(),
      });
      return NextResponse.json(
        { error: "Invalid query parameters" },
        { status: 400 }
      );
    }

    const { limit, offset } = queryResult.data;

    // 必要なカラムのみ取得してパフォーマンスを最適化
    const newsList = await prisma.news.findMany({
      select: {
        id: true,
        title: true,
        date: true,
        summary: true,
      },
      orderBy: { date: "desc" },
      take: limit,
      skip: offset,
    });

    const response = newsListResponseSchema.parse({ newsList });

    log.info("News list fetched successfully", {
      count: newsList.length,
      limit,
      offset,
    });

    return NextResponse.json(response);
  } catch (error) {
    log.error(
      "Failed to fetch news list",
      error instanceof Error ? error : new Error(String(error))
    );
    return NextResponse.json(
      { error: "Failed to fetch news" },
      { status: 500 }
    );
  }
}
