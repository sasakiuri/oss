"use client";

import { useEffect, useCallback } from "react";
import Image from "next/image";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  Progress,
  Skeleton,
  Checkbox,
  Label,
} from "@/components/ui";
import { LuSkipForward, LuEye, LuRefreshCw } from "react-icons/lu";
import {
  AppHeader,
  AppLayout,
  AppFooter,
} from "@/app/(standalone)/_components";
import {
  useGameSpeciesStore,
  useCurrentQuiz,
  useQuizProgress,
} from "./_store";
import { shuffleArray } from "@/lib/utils/array";
import { quizList } from "./quiz-data";

// Constants
const AUTO_PLAY_INTERVAL_MS = 3000;

// Keyboard shortcuts
const KEYBOARD_SHORTCUTS = {
  NEXT: ["ArrowRight", " "] as readonly string[],
  SHOW_ANSWER: ["Enter"] as readonly string[],
  RESET: ["r", "R"] as readonly string[],
};

export function GameSpeciesTestClient() {
  const { showingAnswer, autoPlay, setShowingAnswer, setAutoPlay, nextQuiz, reset } =
    useGameSpeciesStore();
  const currentQuiz = useCurrentQuiz();
  const { percentage } = useQuizProgress();

  const setupNextQuiz = useCallback(() => {
    const state = useGameSpeciesStore.getState();
    if (state.currentIndex === state.quizList.length - 1) {
      reset(shuffleArray(quizList));
      return;
    }
    nextQuiz();
  }, [nextQuiz, reset]);

  // Initialize quiz
  useEffect(() => {
    reset(shuffleArray(quizList));
  }, [reset]);

  // Auto-play interval
  useEffect(() => {
    if (!autoPlay) return;

    const interval = setInterval(setupNextQuiz, AUTO_PLAY_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [autoPlay, setupNextQuiz]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (KEYBOARD_SHORTCUTS.NEXT.includes(e.key)) {
        e.preventDefault();
        setupNextQuiz();
      } else if (KEYBOARD_SHORTCUTS.SHOW_ANSWER.includes(e.key)) {
        e.preventDefault();
        setShowingAnswer(true);
      } else if (KEYBOARD_SHORTCUTS.RESET.includes(e.key)) {
        e.preventDefault();
        reset(shuffleArray(quizList));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setupNextQuiz, setShowingAnswer, reset]);

  const footer = (
    <AppFooter>
      <Button
        variant="ghost"
        className="flex-1 flex-col gap-1 rounded-none py-4 h-auto"
        onClick={setupNextQuiz}
        aria-label="次へ（右矢印キーまたはスペースキー）"
      >
        <LuSkipForward className="h-5 w-5" aria-hidden="true" />
        <span className="text-xs">次へ</span>
      </Button>
      <Button
        variant="ghost"
        className="flex-1 flex-col gap-1 rounded-none py-4 h-auto"
        onClick={() => setShowingAnswer(true)}
        aria-label="正解を表示（Enterキー）"
      >
        <LuEye className="h-5 w-5" aria-hidden="true" />
        <span className="text-xs">正解を表示</span>
      </Button>
      <Button
        variant="ghost"
        className="flex-1 flex-col gap-1 rounded-none py-4 h-auto"
        onClick={() => reset(shuffleArray(quizList))}
        aria-label="リセット（Rキー）"
      >
        <LuRefreshCw className="h-5 w-5" aria-hidden="true" />
        <span className="text-xs">リセット</span>
      </Button>
    </AppFooter>
  );

  return (
    <AppLayout
      header={<AppHeader title="狩猟鳥獣スライドショー" />}
      footer={footer}
    >
      <Card>
        <Progress
          value={percentage}
          className="rounded-none"
          aria-label="進捗"
        />
        <CardHeader>
          {showingAnswer && currentQuiz ? (
            <h2 className="text-xl font-medium" aria-live="polite">
              {currentQuiz.answer}
            </h2>
          ) : (
            <Skeleton className="h-7 w-1/3" aria-label="正解を隠しています" />
          )}
        </CardHeader>
        <CardContent>
          {!currentQuiz ? (
            <Skeleton className="aspect-square w-full" aria-label="読み込み中" />
          ) : (
            <figure className="relative aspect-square w-full overflow-hidden rounded-md">
              <Image
                src={currentQuiz.image}
                alt={showingAnswer ? currentQuiz.answer : "鳥獣の画像"}
                fill
                className="object-cover"
                sizes="(max-width: 640px) 100vw, 576px"
                priority
              />
            </figure>
          )}

          <div className="mt-4 flex items-center gap-2">
            <Checkbox
              id="autoPlay"
              checked={autoPlay}
              onCheckedChange={(checked) => setAutoPlay(checked === true)}
            />
            <Label htmlFor="autoPlay" className="cursor-pointer text-sm">
              自動再生 ({AUTO_PLAY_INTERVAL_MS / 1000}秒)
            </Label>
          </div>
        </CardContent>
      </Card>
    </AppLayout>
  );
}
