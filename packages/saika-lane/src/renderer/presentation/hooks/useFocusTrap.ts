// SPDX-License-Identifier: MIT
import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Hook that manages focus trapping within modals and focus restoration.
 *
 * - When isActive=true, traps focus within containerRef
 * - Remembers previousActiveElement when opened, and restores it when closed
 */
export function useFocusTrap(isActive: boolean, containerRef: RefObject<HTMLElement | null>): void {
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // Focus initialization + restoration
  useEffect(() => {
    if (isActive) {
      previousActiveElement.current = document.activeElement as HTMLElement;
      containerRef.current?.focus();
    } else if (previousActiveElement.current) {
      previousActiveElement.current.focus();
      previousActiveElement.current = null;
    }
  }, [isActive, containerRef]);

  // Tab key cycling
  useEffect(() => {
    if (!isActive) return;

    const handleTabKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !containerRef.current) return;

      const focusableElements = containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
      const focusableArray = Array.from(focusableElements);
      const firstElement = focusableArray[0];
      const lastElement = focusableArray[focusableArray.length - 1];

      if (event.shiftKey) {
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement?.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          event.preventDefault();
          firstElement?.focus();
        }
      }
    };

    document.addEventListener('keydown', handleTabKey);
    return () => {
      document.removeEventListener('keydown', handleTabKey);
    };
  }, [isActive, containerRef]);
}
