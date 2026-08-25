import { useEffect } from 'react';
import { ArrowRight, CalendarDays, MapPin, Plus, Trash2, Trophy } from 'lucide-react';
import { Button } from '../../shared/common/Button';
import { PageHeader } from '../../shared/layout/PageHeader';
import { useChampionshipStore } from '../../../stores/domain/championship.store';
import { useChampionshipActions } from '../../../hooks/useChampionshipActions';
import type { ChampionshipDto } from '@/shared/ipc/contracts/championship.contract';
import { useConfirmDialogStore } from '@/renderer/presentation/stores/ui/confirmDialog.store';

interface ChampionshipListProps {
  onSelect: (championship: ChampionshipDto) => void;
  onCreate: () => void;
}

export function ChampionshipList({ onSelect, onCreate }: ChampionshipListProps) {
  const championships = useChampionshipStore((s) => s.championships);
  const { loadChampionships, deleteChampionship } = useChampionshipActions();

  useEffect(() => {
    loadChampionships();
  }, [loadChampionships]);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (await useConfirmDialogStore.getState().openConfirm('Delete this championship?')) {
      await deleteChampionship(id);
    }
  };

  return (
    <div className="min-h-full">
      <PageHeader
        title="Championships"
        description="Events, entries, firing points and results."
        icon={<Trophy size={23} aria-hidden="true" />}
        actions={
          <Button onClick={onCreate}>
            <Plus size={17} aria-hidden="true" />
            New championship
          </Button>
        }
      />

      <div className="p-5">
        {championships.length === 0 ? (
          <section className="flex max-w-3xl flex-wrap items-center justify-between gap-5 border-y border-vscode-border px-4 py-6">
            <div className="flex items-start gap-3">
              <Trophy size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-vscode-dimmed" />
              <div>
                <h3 className="text-sm font-semibold text-vscode-text">No championships</h3>
                <p className="mt-1 text-[13px] text-vscode-text-muted">
                  Create a championship, then add events, entries and firing-point assignments.
                </p>
              </div>
            </div>
            <Button size="sm" variant="secondary" onClick={onCreate}>
              <Plus size={15} aria-hidden="true" />
              Create championship
            </Button>
          </section>
        ) : (
          <section aria-label="Championship list" className="overflow-hidden border-y border-vscode-border">
            <div className="hidden grid-cols-[minmax(14rem,1fr)_10rem_minmax(12rem,1fr)_2.5rem] gap-4 border-b border-vscode-border bg-vscode-bg-light px-3 py-2 text-[11px] font-semibold text-vscode-text-muted md:grid">
              <span>Name</span>
              <span>Date</span>
              <span>Venue</span>
              <span className="sr-only">Actions</span>
            </div>
            {championships.map((c) => (
              <div
                key={c.id}
                className="group flex min-h-14 items-stretch border-b border-vscode-border/70 last:border-b-0 hover:bg-vscode-bg-hover"
              >
                <button
                  type="button"
                  className="grid min-w-0 flex-1 items-center gap-x-4 gap-y-1 px-3 py-2 text-left md:grid-cols-[minmax(14rem,1fr)_10rem_minmax(12rem,1fr)]"
                  onClick={() => onSelect(c)}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[13px] font-semibold text-vscode-text">{c.name}</span>
                    <ArrowRight
                      size={14}
                      aria-hidden="true"
                      className="shrink-0 text-vscode-dimmed opacity-0 transition-opacity group-hover:opacity-100"
                    />
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-vscode-text-muted">
                    <CalendarDays size={13} aria-hidden="true" className="md:hidden" />
                    {c.date}
                  </span>
                  <span className="flex min-w-0 items-center gap-1.5 text-xs text-vscode-text-muted">
                    <MapPin size={13} aria-hidden="true" className="shrink-0 md:hidden" />
                    <span className="truncate">{c.venue}</span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${c.name}`}
                  onClick={(e) => handleDelete(e, c.id)}
                  className="flex w-10 shrink-0 items-center justify-center text-vscode-dimmed transition-colors hover:bg-vscode-error/10 hover:text-vscode-error"
                >
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
