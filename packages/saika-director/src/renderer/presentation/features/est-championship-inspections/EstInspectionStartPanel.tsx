import { useEffect, useState } from 'react';

import { championshipService, estChampionshipInspectionsService } from '@/renderer/services';
import type { ChampionshipDto, EstChampionshipInspectionAssessmentDto } from '@/shared/ipc/contracts';
import type { EstInspectionStartSettingsDto } from '@/shared/ipc/contracts/estChampionshipInspections.contract';

import { Button } from '../shared/common/Button';

export function EstInspectionStartPanel({
  competitionId,
  lanes,
}: {
  competitionId: string;
  lanes: readonly { laneId: string; label: string }[];
}) {
  const [settings, setSettings] = useState<EstInspectionStartSettingsDto | null>(null);
  const [championships, setChampionships] = useState<ChampionshipDto[]>([]);
  const [inspection, setInspection] = useState<EstChampionshipInspectionAssessmentDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let disposed = false;
    void Promise.all([
      estChampionshipInspectionsService.getStartSettings({ competitionId }),
      championshipService.getChampionships(),
    ])
      .then(([config, all]) => {
        if (disposed) return;
        if (!config.success) throw new Error(config.error.message);
        if (!all.success) throw new Error(all.error.message);
        setSettings(config.data);
        setChampionships(all.data.championships);
      })
      .catch((caught: unknown) => {
        if (!disposed) setError(String(caught));
      });
    return () => {
      disposed = true;
    };
  }, [competitionId]);
  const championshipId = settings?.championshipId;
  useEffect(() => {
    let disposed = false;
    setInspection(null);
    if (championshipId)
      void estChampionshipInspectionsService
        .get({ championshipId })
        .then((response) => {
          if (disposed) return;
          if (!response.success) throw new Error(response.error.message);
          setInspection(response.data);
        })
        .catch((caught: unknown) => {
          if (!disposed) setError(String(caught));
        });
    return () => {
      disposed = true;
    };
  }, [championshipId, refresh]);
  const update = (patch: Partial<EstInspectionStartSettingsDto>) => {
    if (settings) setSettings({ ...settings, ...patch });
    setSaved(false);
  };
  const save = async () => {
    if (!settings) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const response = await estChampionshipInspectionsService.setStartSettings({
        ...settings,
        laneTargets: settings.laneTargets.filter((binding) => lanes.some((lane) => lane.laneId === binding.laneId)),
      });
      if (!response.success) throw new Error(response.error.message);
      setSettings(response.data);
      setSaved(true);
      setRefresh((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section aria-label="EST inspection start checks" className="space-y-3">
      <h2 className="text-sm font-semibold text-vscode-text">EST inspection start checks</h2>
      <p className="text-xs text-vscode-text-muted">
        Required mode checks the latest championship inspection plan and these Lane target assignments before START.
        Configure this separately from relay readiness.
      </p>
      {error && (
        <p role="alert" className="text-xs text-vscode-error">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="text-xs text-vscode-success">
          Inspection start policy saved.
        </p>
      )}
      {settings && (
        <fieldset disabled={busy} className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs">
              Inspection policy
              <select
                className={inputClass}
                value={settings.mode}
                onChange={(event) => update({ mode: event.target.value as EstInspectionStartSettingsDto['mode'] })}
              >
                <option value="ADVISORY">Advisory</option>
                <option value="REQUIRED">Required</option>
                <option value="DISABLED">Disabled</option>
              </select>
            </label>
            <label className="text-xs">
              Inspection championship
              <select
                className={inputClass}
                value={settings.championshipId ?? ''}
                onChange={(event) => update({ championshipId: event.target.value || null, laneTargets: [] })}
              >
                <option value="">Select championship</option>
                {championships.map((value) => (
                  <option key={value.id} value={value.id}>
                    {value.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {championshipId && (
            <div className="flex items-center gap-3 text-xs">
              <p>
                {inspection
                  ? inspection.plan
                    ? `Plan ${inspection.plan.versionNumber} · ${inspection.ready ? 'all targets passed' : 'checks outstanding'}`
                    : 'Create a target inspection plan in the championship.'
                  : 'Loading inspection…'}
              </p>
              <Button size="sm" variant="secondary" onClick={() => setRefresh((value) => value + 1)}>
                Refresh inspection
              </Button>
            </div>
          )}
          {inspection?.plan && (
            <>
              <p className="text-xs text-vscode-text-muted">
                Select the physical targets used by each Lane. Use Ctrl or Command to select multiple targets for a
                rapid-fire bank.
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                {lanes.map((lane) => (
                  <label key={lane.laneId} className="text-xs">
                    Targets · {lane.label}
                    <select
                      multiple
                      className={inputClass}
                      value={
                        settings.laneTargets.find((binding) => binding.laneId === lane.laneId)?.targetIdentifiers ?? []
                      }
                      onChange={(event) => {
                        const ids = Array.from(event.target.selectedOptions).map((option) => option.value);
                        update({
                          laneTargets: [
                            ...settings.laneTargets.filter((binding) => binding.laneId !== lane.laneId),
                            ...(ids.length ? [{ laneId: lane.laneId, targetIdentifiers: ids }] : []),
                          ],
                        });
                      }}
                    >
                      {inspection.targets.map((target) => (
                        <option key={target.targetIdentifier} value={target.targetIdentifier}>
                          {target.targetIdentifier} · {target.status}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </>
          )}
          <Button size="sm" disabled={Boolean(championshipId) && !inspection?.plan} onClick={() => void save()}>
            Save inspection start policy
          </Button>
        </fieldset>
      )}
    </section>
  );
}
const inputClass = 'mt-1 block min-h-8 w-full border border-vscode-border bg-vscode-input px-2 py-1 text-vscode-text';
