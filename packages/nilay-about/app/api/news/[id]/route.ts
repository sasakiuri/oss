import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { newsGetResponseSchema } from "@/lib/schemas";
import { createRequestLogger } from "@/lib/logging";
import {
  checkRateLimit,
  getClientIp,
  rateLimitPresets,
} from "@/lib/api/rate-limit";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

    const { id } = await params;

    const news = await prisma.news.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        date: true,
        summary: true,
      },
    });

    if (!news) {
      log.warn("News not found", { newsId: id });
      return NextResponse.json(
        { error: "News not found" },
        { status: 404 }
      );
    }

    const response = newsGetResponseSchema.parse({ news });
    log.info("News fetched successfully", { newsId: id });
    return NextResponse.json(response);
  } catch (error) {
    log.error(
      "Failed to fetch news",
      error instanceof Error ? error : new Error(String(error))
    );
    return NextResponse.json(
      { error: "Failed to fetch news" },
      { status: 500 }
    );
  }
}
