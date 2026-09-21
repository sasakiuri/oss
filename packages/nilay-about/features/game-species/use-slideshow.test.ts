import { act, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { quizList } from './quiz-data';
import { AUTO_PLAY_INTERVAL_MS, useSlideshow } from './use-slideshow';

afterEach(() => vi.useRealTimers());

describe('slideshow controls', () => {
  it('starts independently and reaches 100% on the final slide before restarting', () => {
    const first = renderHook(useSlideshow);
    const second = renderHook(useSlideshow);
    act(() => first.result.current.showAnswer());
    expect(second.result.current.showingAnswer).toBe(false);
    act(() => {
      for (let index = 1; index < quizList.length; index++) first.result.current.next();
    });
    expect(first.result.current.percentage).toBe(100);
    expect(first.result.current.showingAnswer).toBe(false);
    act(() => first.result.current.next());
    expect(first.result.current.percentage).toBeCloseTo(100 / quizList.length);
  });

  it('advances on a timer and cleans it up when autoplay stops or the page unmounts', () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(useSlideshow);
    act(() => result.current.setAutoPlay(true));
    act(() => vi.advanceTimersByTime(AUTO_PLAY_INTERVAL_MS));
    expect(result.current.percentage).toBeCloseTo(200 / quizList.length);
    act(() => result.current.setAutoPlay(false));
    expect(vi.getTimerCount()).toBe(0);
    act(() => result.current.setAutoPlay(true));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('honors shortcuts without overriding native focused controls', () => {
    const { result } = renderHook(useSlideshow);
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(result.current.showingAnswer).toBe(true);
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    document.body.appendChild(checkbox);
    const before = result.current.percentage;
    fireEvent.keyDown(checkbox, { key: ' ' });
    expect(result.current.percentage).toBe(before);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(result.current.percentage).toBeGreaterThan(before);
    expect(result.current.showingAnswer).toBe(false);
    checkbox.remove();
  });

  it('keeps navigation and reset shortcuts active on focused action buttons', () => {
    const { result } = renderHook(useSlideshow);
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.focus();
    const firstSlide = result.current.percentage;

    expect(fireEvent.keyDown(button, { key: ' ' })).toBe(true);
    expect(result.current.percentage).toBe(firstSlide);
    expect(fireEvent.keyDown(button, { key: 'Enter' })).toBe(true);
    expect(result.current.showingAnswer).toBe(false);

    fireEvent.keyDown(button, { key: 'ArrowRight' });
    expect(result.current.percentage).toBeGreaterThan(firstSlide);
    act(() => result.current.showAnswer());
    fireEvent.keyDown(button, { key: 'R' });
    expect(result.current.percentage).toBe(firstSlide);
    expect(result.current.showingAnswer).toBe(false);
    button.remove();
  });

  it.each(['input', 'textarea', 'div'])('leaves all shortcuts to an editable %s', (tag) => {
    const { result } = renderHook(useSlideshow);
    act(() => {
      result.current.next();
      result.current.showAnswer();
    });
    const field = document.createElement(tag);
    if (tag === 'div') field.setAttribute('contenteditable', 'true');
    document.body.appendChild(field);
    const before = result.current.percentage;
    for (const key of ['ArrowRight', 'r', 'Enter', ' ']) {
      expect(fireEvent.keyDown(field, { key })).toBe(true);
    }
    expect(result.current.percentage).toBe(before);
    expect(result.current.showingAnswer).toBe(true);
    field.remove();
  });
});
