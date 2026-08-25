import { useState, useCallback } from 'react';
import type { ScoreSheetDto } from '@/shared/ipc/contracts/laneControl.contract';
import { Logger } from '@/shared/utils/Logger';
import { laneControlService } from '@/renderer/services';

const logger = Logger.create('usePrint');

export interface PrintContext {
  championshipName?: string;
  venue?: string;
  eventName?: string;
}

export function usePrint() {
  const [isPrintMode, setIsPrintMode] = useState(false);
  const [printData, setPrintData] = useState<ScoreSheetDto[]>([]);
  const [loading, setLoading] = useState(false);

  const openPrintView = useCallback(async (laneIds: string[], context?: PrintContext) => {
    setLoading(true);
    try {
      const response = await laneControlService.getScoreSheets({ laneIds });
      if (response.success) {
        const sheetsWithContext = response.data.scoreSheets.map((sheet: ScoreSheetDto) => ({
          ...sheet,
          eventName: context?.eventName,
          championshipName: context?.championshipName,
          venue: context?.venue,
        }));
        setPrintData(sheetsWithContext);
        setIsPrintMode(true);
      } else {
        logger.error('Failed to get score sheets:', response.error);
      }
    } catch (error) {
      logger.error('Error fetching score sheets:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const closePrintView = useCallback(() => {
    setIsPrintMode(false);
    setPrintData([]);
  }, []);

  const executePrint = useCallback(() => {
    window.print();
  }, []);

  return {
    isPrintMode,
    printData,
    loading,
    openPrintView,
    closePrintView,
    executePrint,
  };
}
