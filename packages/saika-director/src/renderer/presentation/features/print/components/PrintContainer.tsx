import type { ScoreSheetDto } from '@/shared/ipc/contracts/laneControl.contract';
import { ScoreSheet } from './ScoreSheet';
import { Button } from '../../shared/common/Button';

interface PrintContainerProps {
  scoreSheets: ScoreSheetDto[];
  onClose: () => void;
  onPrint: () => void;
}

export function PrintContainer({ scoreSheets, onClose, onPrint }: PrintContainerProps) {
  return (
    <div className="print-container">
      <div className="print-preview-controls no-print">
        <Button variant="primary" onClick={onPrint}>
          Print
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
      {scoreSheets.map((sheet) => (
        <ScoreSheet key={sheet.laneId} data={sheet} />
      ))}
    </div>
  );
}
