import type { Metadata } from "next";
import Link from "next/link";
import { Container, PageTitle } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { Button } from "@/components/ui";

export const metadata: Metadata = {
  title: "Labs",
  description: "試験的に作成したツールなどを公開しています。",
};

const tools = [
  {
    slug: "home-target",
    title: "home-target",
    description:
      "距離に応じた標的の高さと黒丸のサイズを計算します。自宅での練習等にご活用ください。※印刷時には「実際のサイズ」をご指定ください。",
  },
  {
    slug: "game-species-test",
    title: "狩猟鳥獣スライドショー",
    description: "狩猟鳥獣の画像と名前をスライドショーでご覧いただけます。",
  },
];

export default function LabsPage() {
  return (
    <Container>
      <PageTitle title="ツール" subtitle="Labs" />

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {tools.map((tool) => (
          <Card key={tool.slug} className="flex flex-col">
            <CardHeader>
              <CardTitle className="text-xl text-muted-foreground">
                {tool.title}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col justify-between">
              <p className="text-sm text-foreground">{tool.description}</p>
              <div className="mt-4">
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`/labs/${tool.slug}`}>Learn More</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </Container>
  );
}
