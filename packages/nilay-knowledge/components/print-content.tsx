'use client';

import { useEffect } from 'react';

/** Include collapsed article details in browser printing, then restore the reading state. */
export function PrintContent() {
  useEffect(() => {
    let closedDetails: HTMLDetailsElement[] = [];
    const prepare = () => {
      closedDetails.push(...document.querySelectorAll<HTMLDetailsElement>('.reading-article details:not([open])'));
      closedDetails.forEach((details) => {
        details.open = true;
      });
    };
    const restore = () => {
      closedDetails.forEach((details) => {
        details.open = false;
      });
      closedDetails = [];
    };
    window.addEventListener('beforeprint', prepare);
    window.addEventListener('afterprint', restore);
    return () => {
      window.removeEventListener('beforeprint', prepare);
      window.removeEventListener('afterprint', restore);
      restore();
    };
  }, []);
  return null;
}
