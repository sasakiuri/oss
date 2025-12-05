import type { Metadata } from "next";
import { Container } from "@/components/layout";
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
    <Container size="md">
      <NewsDetailClient id={id} />
    </Container>
  );
}
