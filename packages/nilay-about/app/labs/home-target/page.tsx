import type { Metadata } from "next";
import { HomeTargetClient } from "./home-target-client";

export const metadata: Metadata = {
  title: "Target Calculator",
  description:
    "距離に応じた標的の高さと黒丸のサイズを計算します。自宅での練習等にご活用ください。",
};

export default function HomeTargetPage() {
  return <HomeTargetClient />;
}
