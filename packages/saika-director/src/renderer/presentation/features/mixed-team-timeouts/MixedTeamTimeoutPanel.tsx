import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock3, RefreshCw } from 'lucide-react';

import { mixedTeamTimeoutsService } from '@/renderer/services';
import type { DirectorLaneSnapshotDto, MixedTeamTimeoutDto } from '@/shared/ipc/contracts';
import { Button } from '../shared/common/Button';

export function MixedTeamTimeoutPanel({
  competitionId,
  lanes,
  disabled,
}: {
  competitionId: string;
  lanes: readonly DirectorLaneSnapshotDto[];
  disabled?: boolean;
}) {
  const teams = useMemo(() => {
    const result = new Map<string, { id: string; name: string; shotCounts: number[] }>();
    for (const lane of lanes) {
      const athlete = lane.assignment?.athlete;
      if (!athlete?.teamId) continue;
      const team = result.get(athlete.teamId) ?? {
        id: athlete.teamId,
        name: athlete.teamName ?? athlete.teamId,
        shotCounts: [],
      };
      if (lane.score) team.shotCounts.push(lane.score.totalShotCount);
      result.set(team.id, team);
    }
    return [...result.values()].sort((left, right) => left.name.localeCompare(right.name));
  }, [lanes]);
  const [sessions, setSessions] = useState<MixedTeamTimeoutDto[]>([]);
  const [requestingTeamId, setRequestingTeamId] = useState('');
  const [courtesyTeamIds, setCourtesyTeamIds] = useState<Set<string>>(new Set());
  const [requestedByRole, setRequestedByRole] = useState<'COACH' | 'ATHLETE'>('COACH');
  const [requestedByName, setRequestedByName] = useState('');
  const [officialName, setOfficialName] = useState('');
  const [statement, setStatement] = useState('Timeout requested after completed round; Jury timing started');
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = sessions.find((session) => session.active && Date.parse(session.expiresAt) > now) ?? null;
  const remainingSeconds = active ? Math.max(0, Math.ceil((Date.parse(active.expiresAt) - now) / 1000)) : 0;

  const load = useCallback(async () => {
    setError(null);
    const response = await mixedTeamTimeoutsService.list({ competitionId });
    if (!response.success) {
      setError(response.error.message);
      return;
    }
    setSessions(response.data);
  }, [competitionId]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [active?.id]);
  useEffect(() => {
    if (!requestingTeamId && teams[0]) setRequestingTeamId(teams[0].id);
  }, [requestingTeamId, teams]);

  const selectedTeam = teams.find((team) => team.id === requestingTeamId);
  const shotCounts = selectedTeam?.shotCounts ?? [];
  const consistentShotCount = shotCounts.length === 2 && new Set(shotCounts).size === 1 ? shotCounts[0]! : null;
  const alreadyUsed = sessions.some((session) => !session.voidEntry && session.requestingTeamId === requestingTeamId);
  const formReady = Boolean(
    requestingTeamId && requestedByName.trim() && officialName.trim() && statement.trim() && consistentShotCount,
  );

  const start = async () => {
    if (consistentShotCount === null) return;
    setBusy(true);
    setError(null);
    try {
      const response = await mixedTeamTimeoutsService.start({
        competitionId,
        requestingTeamId,
        courtesyTeamIds: [...courtesyTeamIds],
        requestedByRole,
        requestedByName: requestedByName.trim(),
        afterShot: consistentShotCount,
        officialName: officialName.trim(),
        statement: statement.trim(),
      });
      if (!response.success) throw new Error(response.error.message);
      setNow(Date.now());
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  const close = async (session: MixedTeamTimeoutDto) => {
    setBusy(true);
    setError(null);
    try {
      const response = await mixedTeamTimeoutsService.close({
        timeoutId: session.id,
        officialName: officialName.trim(),
        statement: statement.trim(),
      });
      if (!response.success) throw new Error(response.error.message);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-vscode-text">
            <Clock3 size={16} /> Mixed Team timeout
          </h2>
          <p className="mt-1 text-xs text-vscode-text-muted">
            One 30-second request per team · courtesy participation does not consume another team’s request · ISSF
            6.18.1.7.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => void load()} disabled={busy}>
          <RefreshCw size={13} /> Refresh
        </Button>
      </header>
      {error && <p className="border-l-2 border-vscode-error pl-3 text-xs text-vscode-error">{error}</p>}
      {active && (
        <div className="flex items-center justify-between border-l-2 border-vscode-warning pl-3">
          <p className="text-sm text-vscode-text">
            <strong>{active.requestingTeamId}</strong> · <span className="font-mono text-lg">{remainingSeconds}s</span>
          </p>
          <Button
            size="sm"
            disabled={busy || !officialName.trim() || !statement.trim()}
            onClick={() => void close(active)}
          >
            Announce Time / close
          </Button>
        </div>
      )}
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        <label className={labelClass}>
          Requesting team
          <select
            className={inputClass}
            value={requestingTeamId}
            onChange={(event) => setRequestingTeamId(event.target.value)}
          >
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Requested by
          <select
            className={inputClass}
            value={requestedByRole}
            onChange={(event) => setRequestedByRole(event.target.value as 'COACH' | 'ATHLETE')}
          >
            <option value="COACH">Coach</option>
            <option value="ATHLETE">Athlete</option>
          </select>
        </label>
        <label className={labelClass}>
          Requester name
          <input
            className={inputClass}
            value={requestedByName}
            onChange={(event) => setRequestedByName(event.target.value)}
          />
        </label>
        <label className={labelClass}>
          Jury official
          <input
            className={inputClass}
            value={officialName}
            onChange={(event) => setOfficialName(event.target.value)}
          />
        </label>
      </div>
      <label className={labelClass}>
        Audit statement
        <input className={inputClass} value={statement} onChange={(event) => setStatement(event.target.value)} />
      </label>
      <fieldset className="text-xs text-vscode-text-muted">
        <legend>Other coaches approaching concurrently (courtesy)</legend>
        <div className="mt-1 flex flex-wrap gap-3">
          {teams
            .filter((team) => team.id !== requestingTeamId)
            .map((team) => (
              <label key={team.id} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={courtesyTeamIds.has(team.id)}
                  onChange={() =>
                    setCourtesyTeamIds((current) => {
                      const next = new Set(current);
                      if (next.has(team.id)) next.delete(team.id);
                      else next.add(team.id);
                      return next;
                    })
                  }
                />{' '}
                {team.name}
              </label>
            ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={disabled || busy || Boolean(active) || alreadyUsed || !formReady}
          onClick={() => void start()}
        >
          Start 30-second timeout
        </Button>
        <span className="text-xs text-vscode-text-muted">
          {alreadyUsed
            ? 'Selected team has used its request.'
            : consistentShotCount === null
              ? 'Both team Lane snapshots must show the same completed shot count.'
              : `After shot ${consistentShotCount}`}
        </span>
      </div>
      {sessions.length > 0 && (
        <ul className="divide-y divide-vscode-border border-y border-vscode-border text-xs text-vscode-text-muted">
          {sessions.map((session) => (
            <li key={session.id} className="py-1.5">
              {session.requestingTeamId} · after {session.afterShot} ·{' '}
              {new Date(session.startedAt).toLocaleTimeString()} · courtesy{' '}
              {session.courtesyTeamIds.join(', ') || 'none'}
              {session.voidEntry ? ' · VOID' : ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const labelClass = 'text-xs text-vscode-text-muted';
const inputClass =
  'mt-1 block min-h-8 w-full rounded border border-vscode-border bg-vscode-input px-2 text-xs text-vscode-text';
