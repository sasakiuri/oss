// SPDX-License-Identifier: MIT
'use client';
import { useEffect, useState, type RefObject } from 'react';

/** Becomes true once the element first enters the viewport, and stays true. */
export function useFirstVisible(element: RefObject<Element | null>) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = element.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      setVisible(true);
      observer.disconnect();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [element]);
  return visible;
}
