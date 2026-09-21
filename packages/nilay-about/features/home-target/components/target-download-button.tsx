import { useRef, useState } from 'react';
import { LuDownload, LuLoader } from 'react-icons/lu';

import { Button } from '@/components/ui';

import { downloadTarget } from '../download-target';
import type { Language } from '../model';

export function TargetDownloadButton({ diameterCm, language }: { diameterCm: number | null; language: Language }) {
  const inFlight = useRef(false);
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    if (diameterCm === null || inFlight.current) return;
    inFlight.current = true;
    setDownloading(true);
    try {
      await downloadTarget(diameterCm);
    } catch {
      window.alert(
        language === 'ja'
          ? 'PDF の生成に失敗しました。しばらく時間をおいてから再度お試しください。'
          : 'Failed to generate PDF. Please try again later.',
      );
    } finally {
      inFlight.current = false;
      setDownloading(false);
    }
  }

  return (
    <Button
      variant="ghost"
      onClick={handleDownload}
      disabled={diameterCm === null || downloading}
      className="text-on-surface"
    >
      {downloading ? (
        <LuLoader className="h-[18px] w-[18px] animate-spin" />
      ) : (
        <LuDownload className="h-[18px] w-[18px]" />
      )}
      Get Target
    </Button>
  );
}
