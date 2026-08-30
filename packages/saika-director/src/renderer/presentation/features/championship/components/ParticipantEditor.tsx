import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Save } from 'lucide-react';
import { Button } from '../../shared/common/Button';
import { ParticipantRow as ParticipantRowComponent } from './ParticipantRow';
import type { ParticipantDto } from '@/shared/ipc/contracts/championship.contract';

type ParticipantGender = Exclude<ParticipantDto['gender'], undefined>;
type ParticipantEntryStatus = Exclude<ParticipantDto['entryStatus'], undefined>;

interface ParticipantRow {
  id?: string;
  tempId: string;
  playerName: string;
  familyName: string;
  affiliation: string;
  startNumber: string;
  issfId: string;
  nationCode: string;
  gender: ParticipantGender;
  entryStatus: ParticipantEntryStatus;
  teamId: string;
  teamName: string;
}

interface ParticipantEditorProps {
  participants: ParticipantDto[];
  onSave: (
    participants: Array<{
      id?: string;
      playerName: string;
      familyName: string;
      affiliation: string;
      startNumber: string | null;
      issfId: string | null;
      nationCode: string | null;
      gender: ParticipantGender;
      entryStatus: ParticipantEntryStatus;
      teamId: string | null;
      teamName: string | null;
    }>,
  ) => Promise<ParticipantDto[] | null>;
}

function parseClipboardText(text: string): ParticipantRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const parts = line.split('\t');
      return {
        tempId: crypto.randomUUID(),
        playerName: (parts[0] ?? '').trim(),
        affiliation: (parts[1] ?? '').trim(),
        familyName: (parts[2] ?? parts[0] ?? '').trim(),
        startNumber: (parts[3] ?? '').trim(),
        issfId: (parts[4] ?? '').trim(),
        nationCode: (parts[5] ?? '').trim().toUpperCase(),
        gender: parseGender(parts[6]),
        entryStatus: parseEntryStatus(parts[7]),
        teamId: (parts[8] ?? '').trim(),
        teamName: (parts[9] ?? '').trim(),
      };
    })
    .filter((row) => row.playerName !== '');
}

export function ParticipantEditor({ participants, onSave }: ParticipantEditorProps) {
  const [rows, setRows] = useState<ParticipantRow[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const editVersionRef = useRef(0);
  const isDirtyRef = useRef(false);

  const updateDirty = useCallback((dirty: boolean) => {
    isDirtyRef.current = dirty;
    setIsDirty(dirty);
  }, []);

  const markDirty = useCallback(() => {
    editVersionRef.current += 1;
    updateDirty(true);
  }, [updateDirty]);

  useEffect(() => {
    if (isDirtyRef.current) return;

    setRows(
      participants.map((p) => ({
        id: p.id,
        tempId: crypto.randomUUID(),
        playerName: p.playerName,
        familyName: p.familyName ?? p.playerName,
        affiliation: p.affiliation,
        startNumber: p.startNumber ?? '',
        issfId: p.issfId ?? '',
        nationCode: p.nationCode ?? '',
        gender: p.gender ?? 'UNSPECIFIED',
        entryStatus: p.entryStatus ?? 'COMPETING',
        teamId: p.teamId ?? '',
        teamName: p.teamName ?? '',
      })),
    );
    editVersionRef.current += 1;
    updateDirty(false);
  }, [participants, updateDirty]);

  const addRow = () => {
    setRows([
      ...rows,
      {
        id: undefined,
        tempId: crypto.randomUUID(),
        playerName: '',
        familyName: '',
        affiliation: '',
        startNumber: '',
        issfId: '',
        nationCode: '',
        gender: 'UNSPECIFIED',
        entryStatus: 'COMPETING',
        teamId: '',
        teamName: '',
      },
    ]);
    markDirty();
  };

  const removeRow = (index: number) => {
    setRows(rows.filter((_, i) => i !== index));
    markDirty();
  };

  const updateRow = useCallback(
    (index: number, field: keyof ParticipantRow, value: string) => {
      setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
      markDirty();
    },
    [markDirty],
  );

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') {
      return;
    }
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    const parsed = parseClipboardText(text);
    if (parsed.length > 0) {
      setRows((prev) => [...prev, ...parsed]);
      markDirty();
    }
  };

  const handleSave = async () => {
    const validRows = rows.filter((r) => r.playerName.trim());
    const submittedVersion = editVersionRef.current;
    setIsSaving(true);
    try {
      const savedParticipants = await onSave(
        validRows.map(({ id, playerName, familyName, affiliation, ...official }) => ({
          id,
          playerName,
          familyName: familyName.trim() || playerName,
          affiliation,
          startNumber: official.startNumber.trim() || null,
          issfId: official.issfId.trim() || null,
          nationCode: official.nationCode.trim().toUpperCase() || null,
          gender: official.gender,
          entryStatus: official.entryStatus,
          teamId: official.teamId.trim() || null,
          teamName: official.teamName.trim() || null,
        })),
      );
      if (!savedParticipants) return;

      if (submittedVersion === editVersionRef.current) {
        setRows(
          savedParticipants.map((participant, index) => ({
            id: participant.id,
            tempId: validRows[index]?.tempId ?? crypto.randomUUID(),
            playerName: participant.playerName,
            familyName: participant.familyName ?? participant.playerName,
            affiliation: participant.affiliation,
            startNumber: participant.startNumber ?? '',
            issfId: participant.issfId ?? '',
            nationCode: participant.nationCode ?? '',
            gender: participant.gender ?? 'UNSPECIFIED',
            entryStatus: participant.entryStatus ?? 'COMPETING',
            teamId: participant.teamId ?? '',
            teamName: participant.teamName ?? '',
          })),
        );
        updateDirty(false);
        return;
      }

      const persistedIds = new Map(validRows.map((row, index) => [row.tempId, savedParticipants[index]?.id] as const));
      setRows((currentRows) =>
        currentRows.map((row) => {
          const persistedId = persistedIds.get(row.tempId);
          return persistedId ? { ...row, id: persistedId } : row;
        }),
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDrop = (index: number) => {
    if (dragIndex !== null && dragIndex !== index) {
      setRows((prev) => {
        const updated = [...prev];
        const [moved] = updated.splice(dragIndex, 1);
        const toIndex = dragIndex < index ? index - 1 : index;
        updated.splice(toIndex, 0, moved!);
        return updated;
      });
      markDirty();
    }
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  return (
    <div className="space-y-3" onPaste={handlePaste} tabIndex={0}>
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-[13px] font-semibold text-vscode-text">Entry list</h4>
          <p className="mt-0.5 text-xs text-vscode-text-muted">{rows.length} athletes</p>
        </div>
        {isDirty && (
          <Button size="sm" disabled={isSaving} onClick={() => void handleSave()}>
            <Save size={13} aria-hidden="true" />
            Save
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <p className="border-y border-vscode-border py-4 text-[13px] text-vscode-text-muted">No athletes entered.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-vscode-border">
                <th className="w-6 px-1 py-1.5"></th>
                <th className="px-2 py-1.5 text-left text-[11px] font-semibold text-vscode-text-muted">Family name</th>
                <th className="px-2 py-1.5 text-left text-[11px] font-semibold text-vscode-text-muted">Athlete</th>
                <th className="px-2 py-1.5 text-left text-[11px] font-semibold text-vscode-text-muted">Start #</th>
                <th className="px-2 py-1.5 text-left text-[11px] font-semibold text-vscode-text-muted">ISSF ID</th>
                <th className="px-2 py-1.5 text-left text-[11px] font-semibold text-vscode-text-muted">NOC</th>
                <th className="px-2 py-1.5 text-left text-[11px] font-semibold text-vscode-text-muted">Gender</th>
                <th className="px-2 py-1.5 text-left text-[11px] font-semibold text-vscode-text-muted">Entry</th>
                <th className="px-2 py-1.5 text-left text-[11px] font-semibold text-vscode-text-muted">Team ID</th>
                <th className="px-2 py-1.5 text-left text-[11px] font-semibold text-vscode-text-muted">Team name</th>
                <th className="px-2 py-1.5 text-left text-[11px] font-semibold text-vscode-text-muted">Affiliation</th>
                <th className="w-8 px-2 py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <ParticipantRowComponent
                  key={row.id ?? row.tempId}
                  row={row}
                  index={index}
                  isDragging={dragIndex === index}
                  isDragOver={dragOverIndex === index && dragIndex !== index}
                  onUpdate={updateRow}
                  onRemove={removeRow}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onDragEnd={handleDragEnd}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-1 flex items-center justify-between gap-3">
        <p className="text-xs text-vscode-dimmed">
          Paste athlete, affiliation, family name, start number, ISSF ID, NOC, gender, entry status, team ID, and team
          name.
        </p>
        <Button size="sm" variant="secondary" onClick={addRow}>
          <Plus size={13} aria-hidden="true" />
          Add athlete
        </Button>
      </div>
    </div>
  );
}

function parseGender(value: string | undefined): ParticipantGender {
  const normalized = value?.trim().toUpperCase();
  return normalized === 'M' || normalized === 'F' || normalized === 'X' ? normalized : 'UNSPECIFIED';
}

function parseEntryStatus(value: string | undefined): ParticipantEntryStatus {
  const normalized = value?.trim().toUpperCase();
  return ['COMPETING', 'RPO', 'MQS', 'OOC', 'DNS', 'DNF', 'DSQ', 'DQB'].includes(normalized ?? '')
    ? (normalized as ParticipantEntryStatus)
    : 'COMPETING';
}
