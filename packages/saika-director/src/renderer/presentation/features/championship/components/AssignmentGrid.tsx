interface GridState {
  relayCount: number;
  firingPointCount: number;
  grid: (string | null)[][];
}

interface DragOverCell {
  relayIdx: number;
  fpIdx: number;
}

interface AssignmentGridProps {
  gridState: GridState;
  dragOverCell: DragOverCell | null;
  dragOverValid: boolean;
  getParticipantName: (id: string) => string;
  onDragStart: (e: React.DragEvent, participantId: string, source: { relayIdx: number; fpIdx: number }) => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent, relayIdx: number, fpIdx: number) => void;
  onDragEnter: (e: React.DragEvent, relayIdx: number, fpIdx: number) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, relayIdx: number, fpIdx: number) => void;
  onCellClick: (relayIdx: number, fpIdx: number) => void;
}

function getCellClassName(
  relayIdx: number,
  fpIdx: number,
  filled: boolean,
  dragOverCell: DragOverCell | null,
  dragOverValid: boolean,
): string {
  const isOver = dragOverCell?.relayIdx === relayIdx && dragOverCell?.fpIdx === fpIdx;

  if (isOver && dragOverValid) {
    return 'h-9 min-w-[80px] border-2 border-vscode-primary bg-vscode-primary/10 text-center text-[13px]';
  }
  if (isOver && !dragOverValid) {
    return 'h-9 min-w-[80px] border-2 border-vscode-error bg-vscode-error/10 text-center text-[13px]';
  }
  if (filled) {
    return 'h-9 min-w-[80px] cursor-grab border border-vscode-primary/60 bg-vscode-primary/10 text-center text-[13px] text-vscode-text hover:border-vscode-error/60 hover:bg-vscode-error/10 active:cursor-grabbing';
  }
  return 'h-9 min-w-[80px] border border-vscode-border bg-vscode-input text-center text-[13px] text-vscode-dimmed';
}

export function AssignmentGrid({
  gridState,
  dragOverCell,
  dragOverValid,
  getParticipantName,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  onCellClick,
}: AssignmentGridProps) {
  return (
    <div className="overflow-x-auto">
      <table className="border-collapse">
        <thead>
          <tr>
            <th className="px-2 py-1 text-xs font-medium text-vscode-dimmed"></th>
            {Array.from({ length: gridState.firingPointCount }, (_, fpIdx) => (
              <th key={fpIdx} className="px-2 py-1 text-center text-xs font-medium text-vscode-text-muted">
                Firing point {fpIdx + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {gridState.grid.map((relay, relayIdx) => (
            <tr key={relayIdx}>
              <td className="whitespace-nowrap px-2 py-1 text-xs font-medium text-vscode-text-muted">
                Relay {relayIdx + 1}
              </td>
              {relay.map((pid, fpIdx) => {
                const filled = pid !== null;
                return (
                  <td
                    key={fpIdx}
                    className={getCellClassName(relayIdx, fpIdx, filled, dragOverCell, dragOverValid)}
                    draggable={filled}
                    onDragStart={filled ? (e) => onDragStart(e, pid, { relayIdx, fpIdx }) : undefined}
                    onDragEnd={filled ? onDragEnd : undefined}
                    onDragOver={(e) => onDragOver(e, relayIdx, fpIdx)}
                    onDragEnter={(e) => onDragEnter(e, relayIdx, fpIdx)}
                    onDragLeave={onDragLeave}
                    onDrop={(e) => onDrop(e, relayIdx, fpIdx)}
                    onClick={() => filled && onCellClick(relayIdx, fpIdx)}
                    title={
                      filled
                        ? `Drag to move / click to unassign: ${getParticipantName(pid)}`
                        : 'Drag and drop an athlete'
                    }
                  >
                    {filled ? getParticipantName(pid) : '-'}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
