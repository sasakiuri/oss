import type { ParticipantDto } from '@/shared/ipc/contracts/championship.contract';

interface ParticipantPoolProps {
  participants: ParticipantDto[];
  draggingParticipantId: string | null;
  isParticipantAssigned: (participantId: string) => boolean;
  onDragStart: (e: React.DragEvent, participantId: string) => void;
  onDragEnd: () => void;
}

export function ParticipantPool({
  participants,
  draggingParticipantId,
  isParticipantAssigned,
  onDragStart,
  onDragEnd,
}: ParticipantPoolProps) {
  return (
    <div className="space-y-2">
      <h5 className="text-xs font-medium text-vscode-text-muted">Athlete pool</h5>
      <div className="flex flex-wrap gap-2">
        {participants.map((p) => {
          const assigned = isParticipantAssigned(p.id);
          const isDragging = draggingParticipantId === p.id;

          return (
            <div
              key={p.id}
              draggable={!assigned}
              onDragStart={(e) => onDragStart(e, p.id)}
              onDragEnd={onDragEnd}
              title={assigned ? 'Already assigned. Drag from the assignment grid to move this athlete.' : undefined}
              className={`rounded-[3px] border border-vscode-border bg-vscode-bg-lighter px-2 py-1 text-[13px] text-vscode-text${assigned ? ' cursor-default opacity-50' : ' cursor-grab active:cursor-grabbing'}${isDragging ? ' opacity-30' : ''}`}
            >
              {p.playerName}
            </div>
          );
        })}
      </div>
      {participants.length === 0 && <p className="text-[13px] text-vscode-dimmed">No athletes registered.</p>}
    </div>
  );
}
