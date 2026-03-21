// SPDX-License-Identifier: MIT
import { useEffect } from 'react';

/**
 * Hook that locks body scroll while isActive=true
 */
export function useBodyScrollLock(isActive: boolean): void {
  useEffect(() => {
    if (isActive) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [isActive]);
}
