import type { Metadata } from "next";
import Link from "next/link";
import { NewsDetailClient } from "./news-detail-client";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return {
    title: "お知らせ",
    description:
      "Nilay からのお知らせです。商品の入荷情報やアップデート情報をお届けします。",
    alternates: {
      canonical: `/news/${id}`,
    },
  };
}

export default async function NewsDetailPage({ params }: Props) {
  const { id } = await params;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <p>
        <Link href="/news">&lt; お知らせ一覧に戻る</Link>
      </p>
      <hr />
      <NewsDetailClient id={id} />
    </div>
  );
}
