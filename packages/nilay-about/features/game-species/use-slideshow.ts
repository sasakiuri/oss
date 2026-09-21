import { useCallback, useEffect, useState } from 'react';
import { useStore } from 'zustand';

import { shuffleArray } from '@/lib/utils/array';

import { quizProgress } from './model';
import { quizList } from './quiz-data';
import { createGameSpeciesStore } from './store';

export const AUTO_PLAY_INTERVAL_MS = 3000;

export function useSlideshow() {
  const [store] = useState(createGameSpeciesStore);
  const state = useStore(store);
  const restart = useCallback(() => store.getState().restart(shuffleArray(quizList)), [store]);
  const next = useCallback(() => {
    const current = store.getState();
    if (current.currentIndex >= current.quizList.length - 1) restart();
    else current.nextQuiz();
  }, [store, restart]);

  useEffect(restart, [restart]);

  useEffect(() => {
    if (!state.autoPlay) return;
    const interval = setInterval(next, AUTO_PLAY_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [state.autoPlay, next]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.isComposing) return;
      if (event.target instanceof Element) {
        // Editable fields own every key; action controls own their activation keys.
        if (event.target.closest('input, select, textarea, [contenteditable]:not([contenteditable="false"])')) return;
        if ((event.key === 'Enter' || event.key === ' ') && event.target.closest('button, a, [role="button"]')) return;
      }
      if (event.key === 'ArrowRight' || event.key === ' ') next();
      else if (event.key === 'Enter') store.getState().showAnswer();
      else if (event.key.toLowerCase() === 'r') restart();
      else return;
      event.preventDefault();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [store, next, restart]);

  return {
    currentQuiz: state.quizList[state.currentIndex] ?? null,
    percentage: quizProgress(state.currentIndex, state.quizList.length),
    showingAnswer: state.showingAnswer,
    autoPlay: state.autoPlay,
    setAutoPlay: state.setAutoPlay,
    showAnswer: state.showAnswer,
    next,
    restart,
  };
}
