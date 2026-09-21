'use client';

import Image from 'next/image';

import { AppHeader, AppLayout } from '@/components/labs';
import { Card, CardContent, CardHeader, Progress, Skeleton, Checkbox, Label } from '@/components/ui';

import { SlideshowControls } from './slideshow-controls';
import { AUTO_PLAY_INTERVAL_MS, useSlideshow } from './use-slideshow';

export function GameSpeciesTestClient() {
  const { currentQuiz, percentage, showingAnswer, autoPlay, setAutoPlay, showAnswer, next, restart } = useSlideshow();

  return (
    <AppLayout
      header={<AppHeader title="狩猟鳥獣スライドショー" />}
      footer={<SlideshowControls onNext={next} onShowAnswer={showAnswer} onRestart={restart} />}
    >
      <Card>
        <Progress value={percentage} className="rounded-none" aria-label="進捗" />
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
                alt={showingAnswer ? currentQuiz.answer : '鳥獣の画像'}
                fill
                className="object-cover"
                sizes="(max-width: 640px) 100vw, 576px"
                priority
              />
            </figure>
          )}

          <div className="mt-4 flex items-center gap-2">
            <Checkbox id="autoPlay" checked={autoPlay} onCheckedChange={(checked) => setAutoPlay(checked === true)} />
            <Label htmlFor="autoPlay" className="cursor-pointer text-sm">
              自動再生 ({AUTO_PLAY_INTERVAL_MS / 1000}秒)
            </Label>
          </div>
        </CardContent>
      </Card>
    </AppLayout>
  );
}
