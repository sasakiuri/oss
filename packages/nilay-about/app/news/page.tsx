import type { Metadata } from "next";
import { Container, PageTitle } from "@/components/layout";
import { NewsListClient } from "./news-list-client";

export const metadata: Metadata = {
  title: "お知らせ",
  description:
    "Nilay からのお知らせです。商品の入荷情報やアップデート情報をお届けします。",
};

export default function NewsPage() {
  return (
    <Container size="md">
      <PageTitle title="お知らせ" subtitle="News" />
      <NewsListClient />
    </Container>
  );
}
