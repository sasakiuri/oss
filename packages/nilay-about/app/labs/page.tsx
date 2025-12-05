import type { Metadata } from "next";
import Link from "next/link";

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
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1>Labs</h1>
      <p>試験的に作成したツールなどを公開しています。</p>

      <hr />

      <h2>Available Tools</h2>

      <dl>
        {tools.map((tool) => (
          <div key={tool.slug} className="mb-4">
            <dt className="font-bold">
              <Link href={`/labs/${tool.slug}`}>{tool.title}</Link>
            </dt>
            <dd className="ml-8">{tool.description}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
