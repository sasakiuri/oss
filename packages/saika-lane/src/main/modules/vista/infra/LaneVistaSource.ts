// SPDX-License-Identifier: MIT
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  VISTA_CATALOG_PATH,
  VistaSnapshotSchema,
  type VistaCatalog,
  type VistaIdentity,
  type VistaSnapshot,
} from '@sasakiuri/saika-protocol/Vista';

import type { ICompetitionRepository } from '@/main/modules/competition/domain/ICompetitionRepository';
import type { LaneTimerService } from '@/main/modules/competition/infra/LaneTimerService';
import type { ICompetitionInterruptionControl } from '@/main/modules/competition-interruption';
import type { ICompetitionShootOffControl } from '@/main/modules/competition-shoot-off';
import type { ISessionRepository } from '@/main/modules/session/domain/ISessionRepository';
import type { ILocalStorage } from '@/shared/storage/ILocalStorage';

import {
  canonical,
  laneVistaDefinition,
  projectLaneVista,
  type LaneVistaShotContext,
} from '../application/LaneVistaProjection';

interface LaneVistaArchive {
  competitionId: string;
  incarnation: number;
  sessionIds: string[];
  snapshot: VistaSnapshot;
}

/** A durable read model. This class has no competition command or target connection dependency. */
export class LaneVistaSource {
  private readonly snapshots = new Map<string, VistaSnapshot>();
  private readonly current = new Map<string, LaneVistaArchive>();
  private readonly unsupported = new Map<string, VistaCatalog['subjects'][number]>();
  private readonly captureErrors = new Map<string, VistaCatalog['subjects'][number]>();
  private readonly rejectedArchives = new Map<string, VistaCatalog['subjects'][number]>();
  private readonly blockedFiles = new Set<string>();
  private readonly blockedCompetitions = new Set<string>();
  private queue: Promise<void> = Promise.resolve();
  private archiveError: string | null = null;
  private refreshError: string | null = null;

  constructor(
    private readonly options: {
      identity: VistaIdentity;
      directory: string;
      storage: ILocalStorage;
      competitions: ICompetitionRepository;
      sessions: ISessionRepository;
      timer: Pick<LaneTimerService, 'sample'>;
      readShotContexts: (competitionId: string, sessionId: string) => ReadonlyMap<string, LaneVistaShotContext>;
      interruptions: Pick<ICompetitionInterruptionControl, 'get'>;
      shootOffs: Pick<ICompetitionShootOffControl, 'getState'>;
      readShootOffSeries: (competitionId: string, sessionId: string) => ReadonlyMap<string, number>;
    },
  ) {
    mkdirSync(options.directory, { recursive: true, mode: 0o700 });
    const restoredSubjects: Array<{ competitionId: string; subjectId: string }> = [];
    for (const file of readdirSync(options.directory).filter((name) => name.endsWith('.json'))) {
      let competitionId: string | undefined;
      try {
        const archive = JSON.parse(readFileSync(join(options.directory, file), 'utf8')) as LaneVistaArchive;
        if (typeof archive?.competitionId === 'string' && archive.competitionId.length <= 256)
          competitionId = archive.competitionId;
        if (
          typeof archive.competitionId !== 'string' ||
          !archive.competitionId ||
          !Number.isSafeInteger(archive.incarnation) ||
          archive.incarnation < 0 ||
          !Array.isArray(archive.sessionIds) ||
          archive.sessionIds.some((id) => typeof id !== 'string')
        )
          throw new Error('Invalid Vista archive');
        const snapshot = VistaSnapshotSchema.parse(archive.snapshot);
        if (snapshot.sourceId !== options.identity.sourceId) throw new Error('Archive belongs to a different source');
        archive.snapshot = snapshot;
        this.snapshots.set(snapshot.subjectId, snapshot);
        restoredSubjects.push({ competitionId: archive.competitionId, subjectId: snapshot.subjectId });
        if ((this.current.get(archive.competitionId)?.incarnation ?? -1) < archive.incarnation)
          this.current.set(archive.competitionId, archive);
      } catch {
        this.archiveError = 'A saved Vista archive is unreadable; the file has been retained for recovery.';
        this.blockedFiles.add(file);
        if (competitionId) this.blockedCompetitions.add(competitionId);
        const encoded = file.slice(0, -'.json'.length);
        const subjectId = Buffer.from(encoded, 'hex').toString('utf8');
        if (subjectId && Buffer.from(subjectId).toString('hex') === encoded) {
          // The filename identifies the protected subject even if its JSON is truncated.
          this.blockedCompetitions.add(subjectId);
          this.rejectedArchives.set(subjectId, {
            id: subjectId,
            label: 'Saved Vista archive unavailable',
            eventCode: 'Unsupported',
            competition: null,
            relay: null,
            availability: 'unsupported',
            reason: this.archiveError,
          });
        }
      }
    }
    for (const { competitionId, subjectId } of restoredSubjects) {
      if (!this.blockedCompetitions.has(competitionId)) continue;
      const snapshot = this.snapshots.get(subjectId)!;
      this.rejectedArchives.set(subjectId, {
        id: subjectId,
        label: snapshot.label,
        eventCode: snapshot.definition.eventCode,
        competition: snapshot.definition.name,
        relay: null,
        availability: 'unsupported',
        reason: 'A saved archive for this competition is unreadable; its data cannot be confirmed.',
      });
    }
    for (const [id, subject] of this.rejectedArchives) this.unsupported.set(id, subject);
  }

  getError(): string | null {
    return this.refreshError ?? this.archiveError ?? this.captureErrors.values().next().value?.reason ?? null;
  }

  refresh(): Promise<void> {
    const next = this.queue.then(async () => {
      await this.capture();
      this.refreshError = null;
    });
    this.queue = next.catch((error: unknown) => {
      this.refreshError = error instanceof Error ? error.message : 'Vista snapshot persistence failed';
    });
    return next;
  }

  async handle(method: string, path: string): Promise<unknown> {
    if (method !== 'GET') throw new Error('Vista source is read-only');
    await this.refresh();
    if (path === VISTA_CATALOG_PATH) return this.catalog();
    const match = /^\/vista\/v1\/snapshot\/([^/]+)$/.exec(path);
    if (!match?.[1]) throw new Error('Unknown Vista source request');
    const id = decodeURIComponent(match[1]);
    if (this.unsupported.has(id)) throw new Error(this.unsupported.get(id)?.reason ?? 'Unsupported competition');
    const snapshot = this.snapshots.get(id);
    if (!snapshot) throw new Error('Vista subject was not found');
    return { ...snapshot, capturedAt: Date.now() };
  }

  catalog(): VistaCatalog {
    return {
      identity: this.options.identity,
      subjects: [
        ...[...this.snapshots.values()]
          .filter((snapshot) => !this.unsupported.has(snapshot.subjectId))
          .map((snapshot) => ({
            id: snapshot.subjectId,
            label: snapshot.label,
            eventCode: snapshot.definition.eventCode,
            competition: snapshot.definition.name,
            relay: null,
            availability: 'available' as const,
            reason: null,
          })),
        ...this.unsupported.values(),
      ],
    };
  }

  private async capture(): Promise<void> {
    const { sessions, storage } = this.options;
    this.unsupported.clear();
    for (const [id, subject] of this.rejectedArchives) this.unsupported.set(id, subject);
    for (const subject of this.captureErrors.values()) this.unsupported.set(subject.id, subject);
    const ids = Object.keys(storage.getAll())
      .filter((key) => key.startsWith('competition:') && key !== 'competition:active')
      .map((key) => key.slice('competition:'.length));
    const competitionIds = new Set(ids);
    for (const id of this.captureErrors.keys()) {
      if (!competitionIds.has(id)) this.clearCaptureError(id);
    }
    for (const id of this.current.keys()) {
      if (!competitionIds.has(id) && !this.blockedCompetitions.has(id))
        for (const archive of this.unconfirmedArchives(id)) this.persist(archive);
    }
    const preferences = storage.get<{ laneNumber?: number }>('userPreferences');
    const laneName = storage.get<string>('mqtt.laneAlias') || `Lane ${preferences?.laneNumber ?? 1}`;
    for (const id of ids) {
      if (this.blockedCompetitions.has(id)) continue;
      let archives: LaneVistaArchive[] | null;
      try {
        archives = await this.captureCompetition(id, laneName);
      } catch (cause) {
        this.rejectCapture(id, cause);
        continue;
      }
      if (archives === null) continue;
      // Validation failures belong to one subject. Archive writes remain outside
      // that boundary so a failed durable replacement still rejects the refresh.
      for (const archive of archives) this.persist(archive);
      this.clearCaptureError(id);
    }
    // Checking presence avoids reconstructing a failed competition again after
    // its error has already been isolated above.
    const activeId = storage.get<string>('competition:active');
    if (!activeId || !storage.get(`competition:${activeId}`)) {
      try {
        const activeSession = await sessions.findActive();
        if (activeSession) {
          const id = `session:${activeSession.id}`;
          this.unsupported.set(id, {
            id,
            label: `${laneName} · Training`,
            eventCode: activeSession.discipline.value,
            competition: null,
            relay: null,
            availability: 'unsupported',
            reason: 'Start a supported standard competition in Lane to publish its selected rule definition.',
          });
        }
      } catch (cause) {
        this.rejectCapture('session:active', cause);
      }
    }
  }

  private async captureCompetition(id: string, laneName: string): Promise<LaneVistaArchive[] | null> {
    const { competitions, sessions, storage, timer, identity } = this.options;
    const competition = await competitions.findById(id);
    if (!competition) {
      return this.unconfirmedArchives(id);
    }
    const links = storage.get<Array<{ sessionId: string; stage: number }>>(`vista-session-links:${id}`) ?? [
      { sessionId: competition.sessionId, stage: competition.currentStageIndex },
    ];
    const sessionEpochs = await Promise.all(links.map((link) => sessions.readResetEpoch(link.sessionId)));
    const resetStartIndex = sessionEpochs.reduce((last, epoch, index) => (epoch === null ? last : index), -1);
    // A reset starts a new display subject. Earlier stage sessions belong to
    // the saved subject, including their sightings during a later sighting window.
    const historyLinks = links.slice(Math.max(0, resetStartIndex));
    const resetMarkers = links
      .map((link, index) => [link.sessionId, sessionEpochs[index]] as const)
      .filter(([, epoch]) => epoch !== null)
      .sort(([left], [right]) => left.localeCompare(right));
    // Encode consumed reset boundaries in the existing generation field. New,
    // stage sessions without a reset do not change this prefix or the archive format.
    const epochPrefix = resetMarkers.length
      ? `reset:${createHash('sha256').update(canonical(resetMarkers)).digest('base64url')}:`
      : null;
    const session = await sessions.findById(competition.sessionId);
    if (!session) {
      return this.unconfirmedArchives(id);
    }
    const definition = laneVistaDefinition(competition, session);
    if (!definition) {
      const subjectId = this.current.get(id)?.snapshot.subjectId ?? id;
      this.unsupported.set(subjectId, {
        id: subjectId,
        label: `${laneName} · ${competition.config.name}`,
        eventCode: 'Unsupported',
        competition: competition.config.name,
        relay: null,
        availability: 'unsupported',
        reason: 'The stored rule definition is outside the supported standard individual events.',
      });
      return [];
    }
    const previousArchive = this.current.get(id);
    const previous = previousArchive?.snapshot;
    const shootOffWindow = this.options.shootOffs.getState();
    const shootOff = shootOffWindow?.competitionId === id ? shootOffWindow : null;
    const history = [];
    let historyComplete = resetStartIndex >= 0 || historyLinks.some((link) => link.stage === 0);
    for (const link of historyLinks) {
      const linked = link.sessionId === session.id ? session : await sessions.findById(link.sessionId);
      if (linked) {
        const shotContexts = new Map<string, LaneVistaShotContext>();
        const shootOffSeries = new Map(
          (shootOff?.recordedShotIds ?? []).map((shotId) => [shotId, shootOff!.iteration - 1]),
        );
        for (const shot of previous?.participants.flatMap((participant) => participant.shots) ?? []) {
          if (shot.stage !== null && shot.series !== null)
            shotContexts.set(shot.id, { stage: shot.stage, series: shot.series });
          if (shot.mode === 'shoot-off' && shot.series !== null) shootOffSeries.set(shot.id, shot.series);
        }
        for (const [shotId, context] of this.options.readShotContexts(id, linked.id)) shotContexts.set(shotId, context);
        for (const [shotId, series] of this.options.readShootOffSeries(id, linked.id))
          shootOffSeries.set(shotId, series);
        history.push({
          session: linked,
          stage: link.stage,
          shotContexts,
          shootOffSeries,
        });
      } else historyComplete = false;
    }
    // Reject a read spanning a session/stage transition. The next refresh supplies a coherent full image.
    const current = await competitions.findById(id);
    const currentEpochs = await Promise.all(links.map((link) => sessions.readResetEpoch(link.sessionId)));
    if (
      canonical(current) !== canonical(competition) ||
      canonical(this.options.shootOffs.getState()) !== canonical(shootOffWindow) ||
      currentEpochs.some((epoch, index) => epoch !== sessionEpochs[index])
    )
      return null;
    const shotIds = new Set(history.flatMap((entry) => entry.session.allShots.map((shot) => shot.id)));
    const reset =
      (previous?.participants.some((participant) => participant.shots.some((shot) => !shotIds.has(shot.id))) ??
        false) ||
      (previousArchive?.sessionIds.some((sessionId) => !links.some((link) => link.sessionId === sessionId)) ?? false) ||
      (previous !== undefined && epochPrefix !== null && !previous.generation.startsWith(epochPrefix)) ||
      (previous !== undefined && previous.definition.fingerprint !== definition.fingerprint);
    const nextGeneration = () => `${epochPrefix ?? ''}${randomUUID()}`;
    const generation = reset ? nextGeneration() : (previous?.generation ?? nextGeneration());
    const revision = reset ? 0 : (previous?.revision ?? -1) + 1;
    const subjectId = reset ? `run:${generation}` : (previous?.subjectId ?? id);
    const incarnation = (previousArchive?.incarnation ?? 0) + (reset ? 1 : 0);
    const interruption = competition.phase === 'ACTIVE' ? this.options.interruptions.get(id) : null;
    const sampledClock = ['IDLE', 'STAGE_ENTERED', 'SERIES_ENTERED'].includes(competition.phase)
      ? null
      : timer.sample(id);
    // A timer can keep running after a competition is implicitly finished. Only
    // a stopped or expired sample confirms the clock retained for that subject.
    const liveClock = competition.phase === 'FINISHED' && sampledClock?.running ? null : sampledClock;
    const shootOffStart = shootOff ? Date.parse(shootOff.timerStartAt) : 0;
    const shootOffEnd = shootOffStart + (shootOff?.timerDurationSeconds ?? 0) * 1000;
    const clockNow = Date.now();
    const clock = shootOff
      ? shootOff.status === 'COMPLETE'
        ? null
        : {
            generation: `${shootOff.runId}:${shootOff.iteration}`,
            revision,
            label: 'Shoot-off',
            state:
              clockNow < shootOffStart
                ? ('stopped' as const)
                : clockNow >= shootOffEnd
                  ? ('expired' as const)
                  : ('running' as const),
            remainingMs: clockNow >= shootOffEnd ? 0 : shootOff.timerDurationSeconds * 1000,
            sampledAt: clockNow >= shootOffEnd ? shootOffEnd : shootOffStart,
          }
      : liveClock
        ? {
            generation: `${identity.bootId}:${liveClock.generation}`,
            revision,
            label: competition.currentStageConfig.name,
            state:
              liveClock.remainingMs <= 0
                ? ('expired' as const)
                : liveClock.running
                  ? ('running' as const)
                  : ('stopped' as const),
            remainingMs: liveClock.remainingMs,
            sampledAt: liveClock.sampledAt,
          }
        : interruption?.status === 'PAUSED' || interruption?.status === 'RESUME_PENDING'
          ? {
              generation: interruption.interruptionId,
              revision,
              label: competition.currentStageConfig.name,
              state: 'stopped' as const,
              remainingMs: interruption.capturedRemainingSeconds * 1000,
              sampledAt: interruption.capturedAt.getTime(),
            }
          : competition.phase === 'FINISHED' && previous?.clock?.state !== 'running'
            ? (previous?.clock ?? null)
            : null;
    // Completed subjects retain their display labels while history and scores
    // are reread. A reset creates a new subject using the current Lane settings.
    const completed = !reset && previous?.finished ? previous : null;
    const projected = projectLaneVista({
      sourceId: identity.sourceId,
      competition,
      session,
      definition,
      generation,
      revision,
      laneName:
        completed?.participants.find((participant) => participant.id === identity.sourceId)?.laneName ?? laneName,
      history,
      historyComplete,
      clock,
      interruption,
      shootOffSeries: shootOff ? shootOff.iteration - 1 : null,
    });
    const snapshot: VistaSnapshot = {
      ...projected,
      subjectId,
      label: completed?.label ?? `${projected.label} · Run ${incarnation + 1}`,
    };
    const semantic = (value: VistaSnapshot): string =>
      canonical({
        ...value,
        capturedAt: 0,
        revision: 0,
        clock: value.clock ? { ...value.clock, revision: 0 } : null,
        participants: value.participants.map((participant) => ({
          ...participant,
          clock: participant.clock ? { ...participant.clock, revision: 0 } : null,
        })),
      });
    if (previous && semantic(previous) === semantic(snapshot)) return [];
    const archives: LaneVistaArchive[] = [];
    if (reset && previousArchive) {
      // Competitive values remain frozen under the old key. Mark retirement as
      // one newer metadata revision so an already selected screen stops its clock.
      const frozenClock = previous?.clock
        ? { ...previous.clock, revision: previous.clock.revision + 1, state: 'stopped' as const }
        : null;
      archives.push({
        ...previousArchive,
        snapshot: {
          ...previousArchive.snapshot,
          revision: previousArchive.snapshot.revision + 1,
          clock: frozenClock,
          participants: previousArchive.snapshot.participants.map((participant) => ({
            ...participant,
            dataState: 'saved',
            clock: frozenClock,
          })),
        },
      });
    }
    archives.push({
      competitionId: id,
      incarnation,
      sessionIds: links.map((link) => link.sessionId),
      snapshot,
    });
    return archives;
  }

  private rejectCapture(competitionId: string, cause: unknown): void {
    const snapshot = this.current.get(competitionId)?.snapshot;
    const id = snapshot?.subjectId ?? competitionId;
    const detail = cause instanceof Error ? cause.message : 'Stored data could not be read';
    const subject: VistaCatalog['subjects'][number] = {
      id,
      label: snapshot?.label ?? `Vista subject ${id}`,
      eventCode: snapshot?.definition.eventCode ?? 'Unsupported',
      competition: snapshot?.definition.name ?? null,
      relay: null,
      availability: 'unsupported',
      reason: `Vista data for ${id} cannot be confirmed: ${detail}`.slice(0, 2048),
    };
    this.captureErrors.set(competitionId, subject);
    this.unsupported.set(id, subject);
  }

  private clearCaptureError(competitionId: string): void {
    const previous = this.captureErrors.get(competitionId);
    if (previous && this.unsupported.get(previous.id) === previous) this.unsupported.delete(previous.id);
    this.captureErrors.delete(competitionId);
  }

  private unconfirmedArchives(competitionId: string): LaneVistaArchive[] {
    const archive = this.current.get(competitionId);
    if (!archive) return [];
    const { snapshot } = archive;
    if (
      snapshot.clock?.state !== 'running' &&
      snapshot.participants.every(
        (participant) => participant.dataState === 'saved' && participant.clock?.state !== 'running',
      )
    )
      return [];
    const stopClock = (clock: VistaSnapshot['clock']): VistaSnapshot['clock'] =>
      clock?.state === 'running' ? { ...clock, revision: clock.revision + 1, state: 'stopped' } : clock;
    return [
      {
        ...archive,
        snapshot: {
          ...snapshot,
          revision: snapshot.revision + 1,
          clock: stopClock(snapshot.clock),
          participants: snapshot.participants.map((participant) => ({
            ...participant,
            dataState: 'saved',
            clock: stopClock(participant.clock),
          })),
        },
      },
    ];
  }

  private persist(archive: LaneVistaArchive): void {
    // A complete archive and its incarnation marker are one durable replacement.
    const name = `${Buffer.from(archive.snapshot.subjectId).toString('hex')}.json`;
    if (this.blockedFiles.has(name)) throw new Error('The saved Vista archive is protected for recovery');
    const file = join(this.options.directory, name);
    const temporary = `${file}.tmp`;
    writeFileSync(temporary, JSON.stringify(archive), { mode: 0o600, flush: true });
    renameSync(temporary, file);
    this.snapshots.set(archive.snapshot.subjectId, archive.snapshot);
    this.current.set(archive.competitionId, archive);
  }
}
