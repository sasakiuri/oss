import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { newsGetResponseSchema } from "@/lib/schemas";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const record = await prisma.news.findUnique({
      where: { id },
    });

    if (!record) {
      return NextResponse.json(
        { error: "News not found" },
        { status: 404 }
      );
    }

    const news = {
      id: record.id,
      title: record.title,
      date: record.date,
      summary: record.summary,
    };

    const response = newsGetResponseSchema.parse({ news });
    return NextResponse.json(response);
  } catch (error) {
    console.error("Failed to fetch news:", error);
    return NextResponse.json(
      { error: "Failed to fetch news" },
      { status: 500 }
    );
  }
}
