'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useRecovery } from '@/lib/labs-session';
import { useLanguage } from '@/store';

/**
 * Says, at the top of a Labs tool, that the tool is not saving because a backup restore was cut short
 * and could not be undone, and points to the data page, where the reader settles it. Mounted by the
 * Labs layout; the data page says it in its own words.
 */
export function RecoveryNotice() {
  const failed = useRecovery((state) => state.result === 'failed');
  const pathname = usePathname();
  const language = useLanguage();
  const t = (ja: string, en: string) => (language === 'ja' ? ja : en);
  const shown = failed && pathname !== '/labs/data';
  return (
    <div role="status" className={shown ? 'bg-error-container p-3 text-sm text-on-error-container' : 'sr-only'}>
      {shown && (
        <>
          {t(
            '途中で止まったバックアップの読み込みを元に戻せていないため、保存を止めています。',
            'A backup restore was cut short and has not been undone, so saving is paused. ',
          )}
          <Link href="/labs/data" className="underline">
            {t('データの書き出し・読み込みで解決する', 'Settle it on the backup and restore page')}
          </Link>
        </>
      )}
    </div>
  );
}
