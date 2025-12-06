import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { newsListResponseSchema } from "@/lib/schemas";

export async function GET() {
  try {
    const records = await prisma.news.findMany({
      orderBy: { date: "desc" },
    });

    const newsList = records.map((record) => ({
      id: record.id,
      title: record.title,
      date: record.date,
      summary: record.summary,
    }));

    const response = newsListResponseSchema.parse({ newsList });
    return NextResponse.json(response);
  } catch (error) {
    console.error("Failed to fetch news list:", error);
    return NextResponse.json(
      { error: "Failed to fetch news" },
      { status: 500 }
    );
  }
}
