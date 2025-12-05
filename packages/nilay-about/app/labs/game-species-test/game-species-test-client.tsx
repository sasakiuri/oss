"use client";

import { useEffect, useCallback } from "react";
import Image from "next/image";
import { Button, Card, CardContent, CardHeader, Progress, Skeleton } from "@/components/ui";
import { LuSkipForward, LuEye, LuRefreshCw } from "react-icons/lu";
import { useGameSpeciesStore } from "@/store";
import { quizList } from "./quiz-data";

function shuffleArray<T>(arr: T[]): T[] {
  const resArr = [...arr];
  for (let i = resArr.length - 1; i > 0; i--) {
    const r = Math.floor(Math.random() * (i + 1));
    [resArr[i], resArr[r]] = [resArr[r], resArr[i]];
  }
  return resArr;
}

export function GameSpeciesTestClient() {
  const {
    quizList: shuffledList,
    currentIndex,
    showingAnswer,
    autoPlay,
    setShowingAnswer,
    setAutoPlay,
    nextQuiz,
    reset,
  } = useGameSpeciesStore();

  const setupNextQuiz = useCallback(() => {
    if (currentIndex === shuffledList.length - 1) {
      reset(shuffleArray(quizList));
      return;
    }
    nextQuiz();
  }, [currentIndex, shuffledList.length, nextQuiz, reset]);

  useEffect(() => {
    reset(shuffleArray(quizList));
  }, [reset]);

  useEffect(() => {
    if (!autoPlay) return;

    const interval = setInterval(() => {
      setupNextQuiz();
    }, 3000);

    return () => clearInterval(interval);
  }, [autoPlay, setupNextQuiz]);

  const handleNextClick = () => {
    setupNextQuiz();
  };

  const handleShowAnswerClick = () => {
    setShowingAnswer(true);
  };

  const handleResetClick = () => {
    reset(shuffleArray(quizList));
  };

  const currentQuiz = shuffledList[currentIndex];
  const progress = shuffledList.length > 0 ? (100 * currentIndex) / shuffledList.length : 0;

  return (
    <div className="fixed inset-0 flex flex-col bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-primary text-primary-foreground">
        <div className="mx-auto flex h-14 max-w-xl items-center px-4">
          <h1 className="text-lg font-medium">狩猟鳥獣スライドショー</h1>
        </div>
      </header>

      <main className="flex-1 overflow-auto pb-20">
        <div className="mx-auto max-w-xl p-4">
          <Card>
            <Progress value={progress} className="rounded-none" />
            <CardHeader>
              {showingAnswer && currentQuiz ? (
                <h2 className="text-xl font-medium">{currentQuiz.answer}</h2>
              ) : (
                <Skeleton className="h-7 w-1/3" />
              )}
            </CardHeader>
            <CardContent>
              {!currentQuiz ? (
                <Skeleton className="aspect-square w-full" />
              ) : (
                <div className="relative aspect-square w-full overflow-hidden rounded-md">
                  <Image
                    src={currentQuiz.image}
                    alt={showingAnswer ? currentQuiz.answer : "Quiz image"}
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 100vw, 576px"
                  />
                </div>
              )}

              <div className="mt-4 flex items-center gap-2">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={autoPlay}
                    onChange={() => setAutoPlay(!autoPlay)}
                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                  />
                  <span className="text-sm">自動再生</span>
                </label>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      <footer className="fixed bottom-0 left-0 right-0 border-t border-border bg-background">
        <div className="mx-auto flex max-w-xl items-stretch">
          <Button
            variant="ghost"
            className="flex-1 flex-col gap-1 rounded-none py-4 h-auto"
            onClick={handleNextClick}
          >
            <LuSkipForward className="h-5 w-5" />
            <span className="text-xs">次へ</span>
          </Button>
          <Button
            variant="ghost"
            className="flex-1 flex-col gap-1 rounded-none py-4 h-auto"
            onClick={handleShowAnswerClick}
          >
            <LuEye className="h-5 w-5" />
            <span className="text-xs">正解を表示</span>
          </Button>
          <Button
            variant="ghost"
            className="flex-1 flex-col gap-1 rounded-none py-4 h-auto"
            onClick={handleResetClick}
          >
            <LuRefreshCw className="h-5 w-5" />
            <span className="text-xs">リセット</span>
          </Button>
        </div>
      </footer>
    </div>
  );
}
