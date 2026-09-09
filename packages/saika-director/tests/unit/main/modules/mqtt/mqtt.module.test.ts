// SPDX-License-Identifier: MIT
import { ISSF_2026_AP60, ISSF_2026_AR60, ISSF_2026_P25 } from '@sasakiuri/saika-rules';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  applyQualificationRecoveryDirector,
  settleQualificationRecoveryDirector,
  cancelQualificationRecoveryDirector,
  connectDirector,
  createDirectorCompetition,
  disconnectDirector,
  finishCompetition,
  getSnapshot,
  getClockStartIssues,
  getTimedTargetStartIssues,
  getTimingEvidenceStartIssues,
  getOperationalStartIssues,
  startMatchDirector,
  startQualificationRecoveryDirector,
  startSightingDirector,
  startTimedTargetDirector,
  startEmbeddedBroker,
  stopEmbeddedBroker,
  directorCallbacks,
} = vi.hoisted(() => ({
  applyQualificationRecoveryDirector: vi.fn(),
  settleQualificationRecoveryDirector: vi.fn(),
  cancelQualificationRecoveryDirector: vi.fn(),
  connectDirector: vi.fn().mockResolvedValue(undefined),
  createDirectorCompetition: vi.fn(),
  disconnectDirector: vi.fn().mockResolvedValue(undefined),
  finishCompetition: vi.fn(),
  getSnapshot: vi.fn(),
  getClockStartIssues: vi.fn(() => []),
  getTimedTargetStartIssues: vi.fn(() => []),
  getTimingEvidenceStartIssues: vi.fn(() => []),
  getOperationalStartIssues: vi.fn(() => []),
  startMatchDirector: vi.fn(),
  startQualificationRecoveryDirector: vi.fn(),
  startSightingDirector: vi.fn(),
  startTimedTargetDirector: vi.fn(),
  startEmbeddedBroker: vi.fn().mockResolvedValue(undefined),
  stopEmbeddedBroker: vi.fn().mockResolvedValue(undefined),
  directorCallbacks: {
    onStateChanged: null as ((snapshot: unknown) => void) | null,
    onCompetitionShotObserved: null as ((shot: Record<string, unknown>, payloadJson: string) => void) | null,
    onQualificationRecoveryStateObserved: null as
      ((state: Record<string, unknown>, payloadJson: string) => void) | null,
    onQualificationRecoveryShotObserved: null as ((shot: Record<string, unknown>, payloadJson: string) => void) | null,
    onFiringBoundary: null as ((boundary: Record<string, unknown>) => void) | null,
  },
}));

vi.mock('@/main/modules/mqtt/application/DirectorMqttService', () => ({
  DirectorMqttService: class {
    constructor(
      _options: unknown,
      callbacks: {
        onStateChanged?: (snapshot: unknown) => void;
        onCompetitionShotObserved?: (shot: Record<string, unknown>, payloadJson: string) => void;
        onQualificationRecoveryStateObserved?: (state: Record<string, unknown>, payloadJson: string) => void;
        onQualificationRecoveryShotObserved?: (shot: Record<string, unknown>, payloadJson: string) => void;
        onFiringBoundary?: (boundary: Record<string, unknown>) => void;
      },
    ) {
      directorCallbacks.onStateChanged = callbacks.onStateChanged ?? null;
      directorCallbacks.onCompetitionShotObserved = callbacks.onCompetitionShotObserved ?? null;
      directorCallbacks.onQualificationRecoveryStateObserved = callbacks.onQualificationRecoveryStateObserved ?? null;
      directorCallbacks.onQualificationRecoveryShotObserved = callbacks.onQualificationRecoveryShotObserved ?? null;
      directorCallbacks.onFiringBoundary = callbacks.onFiringBoundary ?? null;
    }

    connect = connectDirector;
    applyQualificationRecovery = applyQualificationRecoveryDirector;
    settleQualificationRecovery = settleQualificationRecoveryDirector;
    cancelQualificationRecovery = cancelQualificationRecoveryDirector;
    createCompetition = createDirectorCompetition;
    disconnect = disconnectDirector;
    getSnapshot = getSnapshot;
    getClockStartIssues = getClockStartIssues;
    getTimedTargetStartIssues = getTimedTargetStartIssues;
    setTimedTargetReadinessPolicy = vi.fn();
    setTimingEvidencePolicy = vi.fn();
    getTimingEvidenceStartIssues = getTimingEvidenceStartIssues;
    startMatch = startMatchDirector;
    startQualificationRecovery = startQualificationRecoveryDirector;
    startSighting = startSightingDirector;
    startTimedTarget = startTimedTargetDirector;
    finishCompetition = finishCompetition;
  },
}));

vi.mock('@/main/modules/mqtt/infra/EmbeddedMqttBroker', () => ({
  EmbeddedMqttBroker: class {
    running = false;
    port = 1883;
    start = startEmbeddedBroker;
    stop = stopEmbeddedBroker;
  },
}));

import { mqttDirectorIdFromEnvironment, mqttModule } from '@/main/modules/mqtt/mqtt.module';
import {
  booleanOperationalSetting,
  type OperationalProfileService,
  type OperationalSettingTarget,
} from '@/main/modules/operational-profiles';
import {
  ApplyQualificationRecoveryTransportToken,
  StartQualificationRecoveryTransportToken,
} from '@/main/modules/range-interruptions/domain/IQualificationRecoveryExecutionTransport';
import { ApplyQualificationRecoverySettlementTransportToken } from '@/main/modules/range-interruptions/domain/IQualificationRecoverySettlementTransport';
import {
  competitionTypeFromRulePack,
  RULE_PACK_CALL_TO_LINE_REQUIREMENT_ID,
  RULE_PACK_SIGHTING_TARGET_VISIBILITY_REQUIREMENT_ID,
  RULE_PACK_SETUP_REQUIREMENT_ID,
  RULE_PACK_TARGET_RESET_REQUIREMENT_ID,
} from '@/shared/competitionTypes';
import { BP60 } from '@/shared/competitionTypes/definitions/BP60';
import { BR60S } from '@/shared/competitionTypes/definitions/BR60S';

const COMPETITION_ID = '11111111-1111-4111-8111-111111111111';
const EVENT_ID = '22222222-2222-4222-8222-222222222222';
const ISSF_SIGHTING_REQUIREMENT_IDS = [
  RULE_PACK_CALL_TO_LINE_REQUIREMENT_ID,
  RULE_PACK_SIGHTING_TARGET_VISIBILITY_REQUIREMENT_ID,
  RULE_PACK_SETUP_REQUIREMENT_ID,
];

describe('mqttDirectorIdFromEnvironment', () => {
  it('uses a distinct configured issuer identity and rejects an empty override', () => {
    expect(mqttDirectorIdFromEnvironment({}, 'persisted-director')).toBe('persisted-director');
    expect(mqttDirectorIdFromEnvironment({ SAIKA_MQTT_DIRECTOR_ID: ' director-a ' }, 'persisted-director')).toBe(
      'director-a',
    );
    expect(() => mqttDirectorIdFromEnvironment({ SAIKA_MQTT_DIRECTOR_ID: '   ' }, 'persisted-director')).toThrow(
      'SAIKA_MQTT_DIRECTOR_ID must not be empty',
    );
  });
});

interface MqttHandlers {
  getStartReadiness(input: { competitionId: string; phase: 'SIGHTING' | 'MATCH' }): Promise<unknown>;
  getFiringWindowViolations(input: { competitionId: string }): Promise<unknown>;
  createCompetition(input: { competitionTypeId: string; laneIds: string[] }): Promise<unknown>;
  setBrokerConfig(input: { mode: 'embedded' | 'external'; url?: string; port?: number }): Promise<unknown>;
  startMatch(input: {
    competitionId: string;
    durationSeconds?: number;
    acknowledgedRequirementIds?: string[];
  }): Promise<unknown>;
  startSighting(input: {
    competitionId: string;
    durationSeconds: number;
    targetLaneIds?: string[];
    acknowledgedRequirementIds?: string[];
  }): Promise<unknown>;
  startTimedTarget(input: {
    competitionId: string;
    programId: string;
    purpose: 'SIGHTING' | 'MATCH';
    stageIndex: number;
    seriesIndex: number;
    targetLaneIds?: string[];
  }): Promise<unknown>;
  executeFinalScriptStep(input: {
    competitionId: string;
    runId: string;
    confirmationEntryId: string;
    branch: 'MAIN' | 'SHOOT_OFF';
    iteration: number;
    step: {
      id: string;
      actor: 'OFFICIAL' | 'CRO' | 'ANNOUNCER';
      kind: 'CHECK' | 'COMMAND' | 'ANNOUNCEMENT' | 'DECLARATION';
      text: string;
      ruleReference: string;
      timing: { mode: 'MANUAL' };
      effect: { type: 'NONE' } | { type: 'DECLARE_RESULTS' };
    };
    eligibleLaneIds?: string[];
    declarationConfirmation?: {
      finalProtestsResolved: true;
      resultProcessConfirmed: true;
    };
  }): Promise<unknown>;
  finishCompetition(input: {
    competitionId: string;
    resultContext?: { eventId: string; relayNumber: number };
  }): Promise<unknown>;
}

function registerModule(
  eventType: string | null,
  operationalSettingTargets: readonly OperationalSettingTarget[] = [],
): {
  profiles: Pick<OperationalProfileService, 'preview' | 'apply'>;
  handlers: MqttHandlers;
  publishResults: ReturnType<typeof vi.fn>;
  queryEvent: ReturnType<typeof vi.fn>;
  emitEvent: ReturnType<typeof vi.fn>;
  config: Map<string, unknown>;
  firingWindowViolations: Record<string, unknown>[];
  assertCompetitionDataAllowed: ReturnType<typeof vi.fn>;
  assertFinalExecutionAuthorized: ReturnType<typeof vi.fn>;
  getFinalDeclarationStatus: ReturnType<typeof vi.fn>;
  declareFinalResults: ReturnType<typeof vi.fn>;
  startQualificationRecoveryTransport: (
    input: Parameters<typeof startQualificationRecoveryDirector>[0],
  ) => Promise<unknown>;
  applyQualificationRecoveryTransport: (
    input: Parameters<typeof applyQualificationRecoveryDirector>[0],
  ) => Promise<unknown>;
  applyQualificationRecoverySettlementTransport: (
    input: Parameters<typeof settleQualificationRecoveryDirector>[0],
  ) => Promise<unknown>;
} {
  let handlers: MqttHandlers | null = null;
  let profiles: Pick<OperationalProfileService, 'preview' | 'apply'> | null = null;
  const emitEvent = vi.fn();
  const publishResults = vi.fn().mockResolvedValue({
    savedCount: 0,
    errors: [`Event ${EVENT_ID} not found`],
  });
  const queryEvent = vi.fn().mockResolvedValue(
    eventType === null
      ? null
      : {
          id: EVENT_ID,
          name: 'Result event',
          eventType,
          round: 'Qualification',
          sortOrder: 0,
        },
  );
  const config = new Map<string, unknown>([
    ['mqtt.broker.port', 1883],
    ['mqtt.broker.mode', 'embedded'],
    ['mqtt.broker.url', 'mqtt://localhost:1883'],
    ['mqtt.director.id', 'director-test'],
    ['mqtt.commandTimeoutMs', 100],
    ['mqtt.startDelayMs', 0],
    ['clockQuality.mode', 'ADVISORY'],
    ['timingEvidence.mode', 'DISABLED'],
    ['timedTargetReadiness.windowEnforcement', 'ADVISORY'],
    ['timedTargetReadiness.boundedShotTiming', 'ADVISORY'],
    ['timedTargetReadiness.physicalSignals', 'ADVISORY'],
  ]);
  const firingWindowBoundaries: Record<string, unknown>[] = [];
  const firingWindowViolations: Record<string, unknown>[] = [];
  const violationKeys = new Set<string>();
  const assertCompetitionDataAllowed = vi.fn();
  const assertFinalExecutionAuthorized = vi.fn(() => ({ eventId: EVENT_ID, officialName: 'CRO A' }));
  const getFinalDeclarationStatus = vi.fn();
  const declareFinalResults = vi.fn();
  const commandHandlers = new Map<string, (input: unknown) => Promise<unknown>>();
  const commandBus = {
    register: vi.fn((token: { name: string }, handler: (input: unknown) => Promise<unknown>) =>
      commandHandlers.set(token.name, handler),
    ),
    execute: vi.fn((token: { name: string }, input: unknown) => {
      const handler = commandHandlers.get(token.name);
      return handler ? handler(input) : publishResults(token, input);
    }),
  };
  const competitionTypes = new Map(
    [
      BR60S,
      BP60,
      competitionTypeFromRulePack(ISSF_2026_AR60),
      competitionTypeFromRulePack(ISSF_2026_AP60),
      competitionTypeFromRulePack(ISSF_2026_P25),
    ].map((definition) => [definition.id, definition]),
  );

  mqttModule.register({
    operationalSettingTargets,
    relayReadinessService: {
      getStartSettings: vi.fn(() => ({ mode: 'ADVISORY' })),
      setStartSettings: vi.fn(),
    } as never,
    estInspectionStartService: { getSettings: vi.fn(() => ({ mode: 'ADVISORY' })), saveSettings: vi.fn() } as never,
    competitionStartReadiness: { assertAllowed: vi.fn(), getStartIssues: getOperationalStartIssues },
    database: {} as never,
    eventBus: { emit: emitEvent } as never,
    commandBus: commandBus as never,
    queryBus: { execute: queryEvent } as never,
    ipcRouter: {
      register: vi.fn((_contract, registeredHandlers) => {
        if (_contract.namespace === 'operationalProfiles') {
          profiles = registeredHandlers as Pick<OperationalProfileService, 'preview' | 'apply'>;
          return;
        }
        handlers = registeredHandlers as MqttHandlers;
      }),
    } as never,
    debugLogStore: { addEntry: vi.fn() } as never,
    appConfigService: {
      get: (key: string) => config.get(key),
      set: (key: string, value: unknown) => {
        config.set(key, value);
      },
      setMany: (values: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(values)) config.set(key, value);
      },
    } as never,
    competitionTypeRegistry: {
      get: (id: string) => {
        const definition = competitionTypes.get(id);
        if (!definition) throw new Error(`Unknown competition type ${id}`);
        return definition;
      },
    } as never,
    laneControlRepository: {} as never,
    competitionShotJournal: { append: vi.fn(), findByCompetition: vi.fn(() => []) } as never,
    firingWindowJournal: {
      appendBoundary: vi.fn((boundary: Record<string, unknown>) => {
        firingWindowBoundaries.push(boundary);
        return true;
      }),
      findBoundariesByCompetition: vi.fn((competitionId: string) =>
        firingWindowBoundaries.filter((boundary) => boundary.competitionId === competitionId),
      ),
      appendViolation: vi.fn((violation: Record<string, unknown>) => {
        const key = [
          violation.competitionId,
          violation.laneId,
          violation.sessionId,
          violation.shotId,
          violation.policyRuleId,
        ].join(':');
        if (violationKeys.has(key)) return false;
        violationKeys.add(key);
        firingWindowViolations.push(violation);
        return true;
      }),
      findViolationsByCompetition: vi.fn((competitionId: string) =>
        firingWindowViolations.filter((violation) => violation.competitionId === competitionId),
      ),
    } as never,
    shotObservationEvidenceJournal: { append: vi.fn(), findByCompetition: vi.fn(() => []) } as never,
    competitionDataGuard: { assertAllowed: assertCompetitionDataAllowed },
    finalOperationService: {
      assertExecutionAuthorized: assertFinalExecutionAuthorized,
      observeShootOffShot: vi.fn(),
    } as never,
    finalResultDeclarationService: {
      getStatus: getFinalDeclarationStatus,
      declare: declareFinalResults,
    } as never,
    participantEligibilityReader: {
      assess: (participantId: string) => ({
        participantId,
        eligible: true,
        blockingCode: null,
        decisionIds: [],
        reason: null,
      }),
    },
  });

  if (!handlers) throw new Error('MQTT handlers were not registered');
  if (!profiles) throw new Error('Operational profile handlers were not registered');
  return {
    profiles,
    handlers,
    publishResults,
    queryEvent,
    emitEvent,
    config,
    firingWindowViolations,
    assertCompetitionDataAllowed,
    assertFinalExecutionAuthorized,
    getFinalDeclarationStatus,
    declareFinalResults,
    startQualificationRecoveryTransport: (input) =>
      commandBus.execute(StartQualificationRecoveryTransportToken, input as never),
    applyQualificationRecoveryTransport: (input) =>
      commandBus.execute(ApplyQualificationRecoveryTransportToken, input as never),
    applyQualificationRecoverySettlementTransport: (input) =>
      commandBus.execute(ApplyQualificationRecoverySettlementTransportToken, input as never),
  };
}

describe('mqttModule broker transitions', () => {
  it('blocks injected shared policy changes while another competition is active and allows a fresh idle retry', async () => {
    let required = false;
    const write = vi.fn((value: boolean) => {
      required = value;
    });
    const { profiles } = registerModule('BR60S', [
      booleanOperationalSetting({ id: 'access', label: 'Authentication', read: () => required, write }),
    ]);
    getSnapshot.mockReturnValue({
      competitions: [
        { competitionId: COMPETITION_ID, phase: 'NOT_STARTED' },
        { competitionId: 'other', phase: 'MATCH' },
      ],
    });
    const selection = { competitionId: COMPETITION_ID, modes: { access: 'REQUIRED' as const } };
    const result = await profiles.apply({ ...selection, fingerprint: (await profiles.preview(selection)).fingerprint });
    expect(result.results[0]).toMatchObject({
      id: 'access',
      status: 'FAILED',
      message: expect.stringContaining('active competitions'),
    });
    expect(write).not.toHaveBeenCalled();
    getSnapshot.mockReturnValue({ competitions: [{ competitionId: COMPETITION_ID, phase: 'NOT_STARTED' }] });
    expect(
      (await profiles.apply({ ...selection, fingerprint: (await profiles.preview(selection)).fingerprint })).complete,
    ).toBe(true);
    expect(required).toBe(true);
  });
  beforeEach(() => {
    vi.clearAllMocks();
    connectDirector.mockResolvedValue(undefined);
    createDirectorCompetition.mockResolvedValue({ competitionId: COMPETITION_ID });
    disconnectDirector.mockResolvedValue(undefined);
    getSnapshot.mockReturnValue({
      connected: true,
      brokerUrl: 'mqtt://localhost:1883',
      activeCompetitionId: COMPETITION_ID,
      lanes: [],
      competitions: [{ competitionId: COMPETITION_ID, competitionTypeId: 'BR60S', phase: 'MATCH' }],
      lastCommand: null,
    });
    finishCompetition.mockResolvedValue({
      commandId: '33333333-3333-4333-8333-333333333333',
      action: 'finish-competition',
      success: true,
      lanes: [],
    });
    startMatchDirector.mockResolvedValue({
      commandId: '66666666-6666-4666-8666-666666666666',
      action: 'start-match',
      success: true,
      lanes: [],
    });
    startQualificationRecoveryDirector.mockResolvedValue({
      commandId: '99999999-9999-4999-8999-999999999999',
      action: 'start-qualification-recovery',
      success: true,
      lanes: [],
    });
    applyQualificationRecoveryDirector.mockResolvedValue({
      commandId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      action: 'apply-qualification-recovery',
      success: true,
      lanes: [],
    });
    settleQualificationRecoveryDirector.mockResolvedValue({
      commandId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      action: 'settle-qualification-recovery',
      success: true,
      lanes: [],
    });
    startSightingDirector.mockResolvedValue({
      commandId: '77777777-7777-4777-8777-777777777777',
      action: 'start-sighting',
      success: true,
      lanes: [],
    });
    startTimedTargetDirector.mockResolvedValue({
      commandId: '88888888-8888-4888-8888-888888888888',
      action: 'start-timed-target',
      success: true,
      lanes: [],
    });
  });

  it('assesses saved policies against server-side membership without starting fire', async () => {
    const { handlers } = registerModule('BR60S');
    getSnapshot.mockReturnValue({
      competitions: [{ competitionId: COMPETITION_ID, competitionTypeId: 'BR60S', laneIds: ['joined-lane'] }],
    });
    const scope = { competitionId: COMPETITION_ID, phase: 'MATCH' as const };
    expect(await handlers.getStartReadiness(scope)).toMatchObject({ ...scope, laneIds: ['joined-lane'], issues: [] });
    expect(getOperationalStartIssues).toHaveBeenCalledWith({ ...scope, laneIds: ['joined-lane'] });
    expect(getClockStartIssues).toHaveBeenCalledWith(['joined-lane']);
    expect(getTimingEvidenceStartIssues).toHaveBeenCalledWith(['joined-lane']);
    expect(getTimedTargetStartIssues).not.toHaveBeenCalled();
    expect(startMatchDirector).not.toHaveBeenCalled();
    expect(startSightingDirector).not.toHaveBeenCalled();
    getSnapshot.mockReturnValue({ competitions: [] });
    await expect(handlers.getStartReadiness(scope)).rejects.toThrow('Competition not found');
  });

  it('exposes independent timed target policies and includes their checks only for target programs', async () => {
    const { profiles, handlers, config } = registerModule('P25');
    getSnapshot.mockReturnValue({
      competitions: [
        { competitionId: COMPETITION_ID, competitionTypeId: 'P25', phase: 'NOT_STARTED', laneIds: ['joined-lane'] },
      ],
    });
    const modes = {
      'timed-target-windowEnforcement': 'REQUIRED' as const,
      'timing-evidence': 'REQUIRED' as const,
      'timed-target-physicalSignals': 'DISABLED' as const,
    };
    const selection = { competitionId: COMPETITION_ID, modes };
    expect(
      await profiles.apply({ ...selection, fingerprint: (await profiles.preview(selection)).fingerprint }),
    ).toMatchObject({ complete: true });
    expect(config.get('timedTargetReadiness.windowEnforcement')).toBe('REQUIRED');
    expect(config.get('timingEvidence.mode')).toBe('REQUIRED');
    expect(config.get('timedTargetReadiness.physicalSignals')).toBe('DISABLED');
    expect(config.get('timedTargetReadiness.boundedShotTiming')).toBe('ADVISORY');
    await handlers.getStartReadiness({ competitionId: COMPETITION_ID, phase: 'MATCH' });
    expect(getTimedTargetStartIssues).toHaveBeenCalledWith(['joined-lane']);
    getSnapshot.mockReturnValue({
      competitions: [
        { competitionId: COMPETITION_ID, phase: 'NOT_STARTED' },
        { competitionId: 'another-event', phase: 'MATCH' },
      ],
    });
    const changed = { ...selection, modes: { 'timed-target-windowEnforcement': 'DISABLED' as const } };
    const result = await profiles.apply({ ...changed, fingerprint: (await profiles.preview(changed)).fingerprint });
    expect(result.complete).toBe(false);
    expect(config.get('timedTargetReadiness.windowEnforcement')).toBe('REQUIRED');
  });

  it('serializes overlapping broker configuration changes', async () => {
    let releaseFirstConnection!: () => void;
    const firstConnectionBarrier = new Promise<void>((resolve) => {
      releaseFirstConnection = resolve;
    });
    let activeConnections = 0;
    let maximumActiveConnections = 0;
    connectDirector.mockImplementation(async () => {
      activeConnections += 1;
      maximumActiveConnections = Math.max(maximumActiveConnections, activeConnections);
      if (connectDirector.mock.calls.length === 1) await firstConnectionBarrier;
      activeConnections -= 1;
    });
    const { handlers, config } = registerModule('BR60S');

    const firstChange = handlers.setBrokerConfig({ mode: 'external', url: 'mqtt://broker-a:1883' });
    const secondChange = handlers.setBrokerConfig({ mode: 'external', url: 'mqtt://broker-b:1883' });

    await vi.waitFor(() => expect(connectDirector).toHaveBeenCalledTimes(1));
    releaseFirstConnection();
    await Promise.all([firstChange, secondChange]);

    expect(maximumActiveConnections).toBe(1);
    expect(connectDirector.mock.calls.map(([url]) => url)).toEqual(['mqtt://broker-a:1883', 'mqtt://broker-b:1883']);
    expect(config.get('mqtt.broker.url')).toBe('mqtt://broker-b:1883');
  });

  it('waits for an in-flight competition operation before changing brokers', async () => {
    let releaseFinish!: () => void;
    const finishBarrier = new Promise<void>((resolve) => {
      releaseFinish = resolve;
    });
    finishCompetition.mockImplementationOnce(async () => {
      await finishBarrier;
      return {
        commandId: '33333333-3333-4333-8333-333333333333',
        action: 'finish-competition',
        success: true,
        lanes: [],
      };
    });
    const { handlers } = registerModule('BR60S');

    const finishing = handlers.finishCompetition({ competitionId: COMPETITION_ID });
    await vi.waitFor(() => expect(finishCompetition).toHaveBeenCalledTimes(1));
    const changingBroker = handlers.setBrokerConfig({ mode: 'external', url: 'mqtt://broker-b:1883' });
    await Promise.resolve();

    expect(disconnectDirector).not.toHaveBeenCalled();
    expect(connectDirector).not.toHaveBeenCalled();

    releaseFinish();
    await Promise.all([finishing, changingBroker]);

    expect(disconnectDirector).toHaveBeenCalledTimes(1);
    expect(connectDirector).toHaveBeenCalledWith('mqtt://broker-b:1883');
  });
});

describe('mqttModule Final step authorization', () => {
  it('rejects a renderer-supplied step before publishing when it is not the confirmed runner snapshot', async () => {
    const { handlers, assertFinalExecutionAuthorized } = registerModule('AR60');
    assertFinalExecutionAuthorized.mockImplementationOnce(() => {
      throw new Error('Final execution step was not confirmed');
    });
    const input = {
      competitionId: COMPETITION_ID,
      runId: '33333333-3333-4333-8333-333333333333',
      confirmationEntryId: '44444444-4444-4444-8444-444444444444',
      branch: 'MAIN' as const,
      iteration: 0,
      step: {
        id: 'untrusted-step',
        actor: 'CRO' as const,
        kind: 'COMMAND' as const,
        text: 'START',
        ruleReference: '6.17',
        timing: { mode: 'MANUAL' as const },
        effect: { type: 'NONE' as const },
      },
    };

    await expect(handlers.executeFinalScriptStep(input)).rejects.toThrow('was not confirmed');
    expect(assertFinalExecutionAuthorized).toHaveBeenCalledWith({ ...input, eligibleLaneIds: [] });
  });

  it('does not replay a RESULTS ARE FINAL cue after the declaration gains a review blocker', async () => {
    const { handlers, getFinalDeclarationStatus, declareFinalResults } = registerModule('AR60');
    getFinalDeclarationStatus.mockResolvedValue({
      declaration: { id: '55555555-5555-4555-8555-555555555555' },
      declarationCurrent: false,
      issues: ['Irregular shot case is unresolved'],
    });

    await expect(
      handlers.executeFinalScriptStep({
        competitionId: COMPETITION_ID,
        runId: '33333333-3333-4333-8333-333333333333',
        confirmationEntryId: '44444444-4444-4444-8444-444444444444',
        branch: 'MAIN',
        iteration: 0,
        step: {
          id: 'declare-results',
          actor: 'CRO',
          kind: 'DECLARATION',
          text: 'RESULTS ARE FINAL',
          ruleReference: '6.17.3(j)',
          timing: { mode: 'MANUAL' },
          effect: { type: 'DECLARE_RESULTS' },
        },
        declarationConfirmation: {
          finalProtestsResolved: true,
          resultProcessConfirmed: true,
        },
      }),
    ).rejects.toThrow('no longer current or has review blockers');
    expect(declareFinalResults).not.toHaveBeenCalled();
  });
});

describe('mqttModule competition definition adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createDirectorCompetition.mockResolvedValue({ competitionId: COMPETITION_ID });
    startMatchDirector.mockResolvedValue({
      commandId: '66666666-6666-4666-8666-666666666666',
      action: 'start-match',
      success: true,
      lanes: [],
    });
    startSightingDirector.mockResolvedValue({
      commandId: '77777777-7777-4777-8777-777777777777',
      action: 'start-sighting',
      success: true,
      lanes: [],
    });
    startTimedTargetDirector.mockResolvedValue({
      commandId: '88888888-8888-4888-8888-888888888888',
      action: 'start-timed-target',
      success: true,
      lanes: [],
    });
    startQualificationRecoveryDirector.mockResolvedValue({
      commandId: '99999999-9999-4999-8999-999999999999',
      action: 'start-qualification-recovery',
      success: true,
      lanes: [],
    });
    applyQualificationRecoveryDirector.mockResolvedValue({
      commandId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      action: 'apply-qualification-recovery',
      success: true,
      lanes: [],
    });
    settleQualificationRecoveryDirector.mockResolvedValue({
      commandId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      action: 'settle-qualification-recovery',
      success: true,
      lanes: [],
    });
  });

  it('creates an AR60 competition with Rule Pack-derived Lane metadata', async () => {
    const { handlers } = registerModule('AR60');

    await handlers.createCompetition({ competitionTypeId: 'AR60', laneIds: [EVENT_ID] });

    expect(createDirectorCompetition).toHaveBeenCalledWith({
      competitionTypeId: 'AR60',
      competitionTypeName: '10m Air Rifle 60 shots',
      competitionUnit: 'INDIVIDUAL',
      discipline: 'AIR_RIFLE_10M',
      roundName: 'Qualification',
      acc: 'DECIMAL',
      shotsPerSeries: 10,
      totalSeries: 6,
      totalShots: 60,
      definitionBinding: {
        protocolVersion: 1,
        compatibilityMode: 'REQUIRED',
        rulePack: expect.objectContaining({
          id: 'ISSF:2026:AR60:QUALIFICATION',
          schemaVersion: 1,
          fingerprint: {
            algorithm: 'SHA-256',
            value: expect.stringMatching(/^[a-f0-9]{64}$/),
          },
        }),
      },
      laneIds: [],
    });
  });

  it('persists and emits a review-only event for an ISSF shot before SIGHTING START', async () => {
    const snapshot = {
      connected: true,
      brokerUrl: 'mqtt://localhost:1883',
      activeCompetitionId: COMPETITION_ID,
      lanes: [],
      competitions: [{ competitionId: COMPETITION_ID, competitionTypeId: 'AR60', phase: 'NOT_STARTED' }],
      lastCommand: null,
    };
    getSnapshot.mockReturnValue(snapshot);
    const { handlers, emitEvent, firingWindowViolations } = registerModule('AR60');
    directorCallbacks.onStateChanged?.(snapshot);
    directorCallbacks.onFiringBoundary?.({
      competitionId: COMPETITION_ID,
      phase: 'SIGHTING',
      transition: 'OPEN',
      occurredAt: new Date('2026-08-30T00:00:10.000Z'),
      commandId: '33333333-3333-4333-8333-333333333333',
      commandIssuedAt: new Date('2026-08-30T00:00:09.000Z'),
      sourceAction: 'start-sighting',
    });
    directorCallbacks.onCompetitionShotObserved?.(
      {
        competitionId: COMPETITION_ID,
        laneId: '44444444-4444-4444-8444-444444444444',
        sessionId: '55555555-5555-4555-8555-555555555555',
        shotId: '66666666-6666-4666-8666-666666666666',
        observationId: '77777777-7777-4777-8777-777777777777',
        x: 0,
        y: 0,
        rawScoreX10: 100,
        deviceScoreX10: 100,
        calculatedScoreX10: 100,
        effectiveScoreX10: 100,
        receivedAt: '2026-08-30T00:00:05.010Z',
        innerTen: false,
        mode: 'SIGHTING',
        timestamp: '2026-08-30T00:00:05.000Z',
        stageIndex: 0,
        scored: true,
        seriesIndex: 0,
        shotNumberInSeries: 1,
        isRecorded: true,
        isReplay: false,
        publishedAt: '2026-08-30T00:00:05.020Z',
      },
      '{}',
    );

    expect(firingWindowViolations).toHaveLength(1);
    expect(firingWindowViolations[0]).toMatchObject({
      kind: 'BEFORE_PREPARATION_AND_SIGHTING_START',
      ruleReference: '6.11.1.1(h)',
    });
    expect(emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'FiringWindowViolationDetected',
        violation: expect.objectContaining({ ruleReference: '6.11.1.1(h)' }),
      }),
    );
    await expect(handlers.getFiringWindowViolations({ competitionId: COMPETITION_ID })).resolves.toEqual([
      expect.objectContaining({ kind: 'BEFORE_PREPARATION_AND_SIGHTING_START' }),
    ]);
  });

  it('requires setup readiness for an initial Rule Pack-backed sighting start', async () => {
    getSnapshot.mockReturnValue({
      connected: true,
      brokerUrl: 'mqtt://localhost:1883',
      activeCompetitionId: COMPETITION_ID,
      lanes: [],
      competitions: [{ competitionId: COMPETITION_ID, competitionTypeId: 'AR60', phase: 'NOT_STARTED' }],
      lastCommand: null,
    });
    const { handlers } = registerModule('AR60');

    await expect(handlers.startSighting({ competitionId: COMPETITION_ID, durationSeconds: 900 })).rejects.toThrow(
      new RegExp(`requires SIGHTING start acknowledgement.*${RULE_PACK_CALL_TO_LINE_REQUIREMENT_ID}`),
    );
    expect(startSightingDirector).not.toHaveBeenCalled();

    await expect(
      handlers.startSighting({
        competitionId: COMPETITION_ID,
        durationSeconds: 900,
        acknowledgedRequirementIds: ISSF_SIGHTING_REQUIREMENT_IDS.slice(0, 2),
      }),
    ).rejects.toThrow(new RegExp(RULE_PACK_SETUP_REQUIREMENT_ID));

    await handlers.startSighting({
      competitionId: COMPETITION_ID,
      durationSeconds: 900,
      acknowledgedRequirementIds: ISSF_SIGHTING_REQUIREMENT_IDS,
    });
    expect(startSightingDirector).toHaveBeenCalledWith(COMPETITION_ID, 900, undefined);
  });

  it('does not repeat initial setup acknowledgement for a pending-Lane sighting retry', async () => {
    getSnapshot.mockReturnValue({
      connected: true,
      brokerUrl: 'mqtt://localhost:1883',
      activeCompetitionId: COMPETITION_ID,
      lanes: [],
      competitions: [{ competitionId: COMPETITION_ID, competitionTypeId: 'AR60', phase: 'SIGHTING' }],
      lastCommand: null,
    });
    const { handlers } = registerModule('AR60');

    await handlers.startSighting({
      competitionId: COMPETITION_ID,
      durationSeconds: 900,
      targetLaneIds: [EVENT_ID],
    });

    expect(startSightingDirector).toHaveBeenCalledWith(COMPETITION_ID, 900, [EVENT_ID]);
  });

  it('requires target-reset confirmation for a Rule Pack-backed MATCH start', async () => {
    getSnapshot.mockReturnValue({
      connected: true,
      brokerUrl: 'mqtt://localhost:1883',
      activeCompetitionId: COMPETITION_ID,
      lanes: [],
      competitions: [{ competitionId: COMPETITION_ID, competitionTypeId: 'AR60', phase: 'SIGHTING_COMPLETE' }],
      lastCommand: null,
    });
    const { handlers } = registerModule('AR60');

    await expect(handlers.startMatch({ competitionId: COMPETITION_ID, durationSeconds: 4_500 })).rejects.toThrow(
      new RegExp(`requires MATCH start acknowledgement.*${RULE_PACK_TARGET_RESET_REQUIREMENT_ID}`),
    );
    expect(startMatchDirector).not.toHaveBeenCalled();

    await expect(
      handlers.startMatch({
        competitionId: COMPETITION_ID,
        durationSeconds: 4_500,
        acknowledgedRequirementIds: [RULE_PACK_SETUP_REQUIREMENT_ID],
      }),
    ).rejects.toThrow(new RegExp(RULE_PACK_TARGET_RESET_REQUIREMENT_ID));

    await handlers.startMatch({
      competitionId: COMPETITION_ID,
      durationSeconds: 4_500,
      acknowledgedRequirementIds: [RULE_PACK_TARGET_RESET_REQUIREMENT_ID],
    });
    expect(startMatchDirector).toHaveBeenCalledWith(COMPETITION_ID, 4_500);
  });

  it('keeps local competition MATCH starts independent of ISSF target-reset policy', async () => {
    getSnapshot.mockReturnValue({
      connected: true,
      brokerUrl: 'mqtt://localhost:1883',
      activeCompetitionId: COMPETITION_ID,
      lanes: [],
      competitions: [{ competitionId: COMPETITION_ID, competitionTypeId: 'BR60S', phase: 'SIGHTING_COMPLETE' }],
      lastCommand: null,
    });
    const { handlers } = registerModule('BR60S');

    await handlers.startMatch({ competitionId: COMPETITION_ID, durationSeconds: 2_700 });

    expect(startMatchDirector).toHaveBeenCalledWith(COMPETITION_ID, 2_700);
  });

  it('separates conventional MATCH timers from independently timed 25m programs', async () => {
    getSnapshot.mockReturnValue({
      connected: true,
      brokerUrl: 'mqtt://localhost:1883',
      activeCompetitionId: COMPETITION_ID,
      lanes: [],
      competitions: [{ competitionId: COMPETITION_ID, competitionTypeId: 'AR60', phase: 'MATCH' }],
      lastCommand: null,
    });
    const conventional = registerModule('AR60');
    await expect(conventional.handlers.startMatch({ competitionId: COMPETITION_ID })).rejects.toThrow(
      'requires a generic MATCH timer duration',
    );

    getSnapshot.mockReturnValue({
      connected: true,
      brokerUrl: 'mqtt://localhost:1883',
      activeCompetitionId: COMPETITION_ID,
      lanes: [],
      competitions: [{ competitionId: COMPETITION_ID, competitionTypeId: 'P25', phase: 'SIGHTING_COMPLETE' }],
      lastCommand: null,
    });
    const timed = registerModule('P25');
    await timed.handlers.startMatch({ competitionId: COMPETITION_ID });

    expect(startMatchDirector).toHaveBeenCalledWith(COMPETITION_ID, undefined);
  });

  it('accepts only the Rule Pack program bound to the current 25m stage and series', async () => {
    getSnapshot.mockReturnValue({
      connected: true,
      brokerUrl: 'mqtt://localhost:1883',
      activeCompetitionId: COMPETITION_ID,
      lanes: [],
      competitions: [
        {
          competitionId: COMPETITION_ID,
          competitionTypeId: 'P25',
          roundName: 'Qualification',
          phase: 'MATCH',
        },
      ],
      lastCommand: null,
    });
    const { handlers } = registerModule('P25');
    const validInput = {
      competitionId: COMPETITION_ID,
      programId: 'P25_MATCH_PRECISION_240',
      purpose: 'MATCH' as const,
      stageIndex: 1,
      seriesIndex: 0,
    };

    await handlers.startTimedTarget(validInput);
    expect(startTimedTargetDirector).toHaveBeenCalledWith(validInput);

    await expect(handlers.startTimedTarget({ ...validInput, programId: 'P25_MATCH_RAPID_3_7' })).rejects.toThrow(
      'does not match MATCH at 1:0',
    );
    expect(startTimedTargetDirector).toHaveBeenCalledTimes(1);
  });

  it('passes an explicit Qualification recovery authorization only when its Rule Pack facts match', async () => {
    getSnapshot.mockReturnValue({
      connected: true,
      brokerUrl: 'mqtt://localhost:1883',
      activeCompetitionId: COMPETITION_ID,
      lanes: [],
      competitions: [
        {
          competitionId: COMPETITION_ID,
          competitionTypeId: 'P25',
          roundName: 'Qualification',
          phase: 'MATCH',
        },
      ],
      lastCommand: null,
    });
    const { startQualificationRecoveryTransport } = registerModule('P25');
    const validInput = {
      competitionId: COMPETITION_ID,
      laneId: '22222222-2222-4222-8222-222222222222',
      runId: '33333333-3333-4333-8333-333333333333',
      decisionId: '44444444-4444-4444-8444-444444444444',
      interruptionId: '55555555-5555-4555-8555-555555555555',
      stageIndex: 1,
      seriesIndex: 0,
      expectedMatchProgramId: 'P25_MATCH_PRECISION_240',
      expectedSeriesShotLimit: 5,
      expectedRecordedShots: 0,
      authorization: {
        phase: 'SERIES_RECOVERY' as const,
        seriesRecovery: {
          treatment: 'ANNUL_AND_REPEAT' as const,
          shotsToFire: 5,
          execution: { mode: 'SAME_TIMED_TARGET_PROGRAM' as const },
        },
      },
      officialName: 'Jury Member',
      decisionRuleReference: 'ISSF 8.8.1.4(a)',
      decidedAt: '2026-09-03T00:00:00.000Z',
    };

    await startQualificationRecoveryTransport(validInput);
    expect(startQualificationRecoveryDirector).toHaveBeenCalledWith(validInput);

    await expect(
      startQualificationRecoveryTransport({ ...validInput, expectedMatchProgramId: 'P25_MATCH_RAPID_3_7' }),
    ).rejects.toThrow('does not match 1:0');
    expect(startQualificationRecoveryDirector).toHaveBeenCalledTimes(1);
  });

  it('registers score adjudication as a separate recovery transport command', async () => {
    const { applyQualificationRecoveryTransport } = registerModule('P25');
    const input = {
      competitionId: COMPETITION_ID,
      laneId: '22222222-2222-4222-8222-222222222222',
      runId: '33333333-3333-4333-8333-333333333333',
      appliedBy: 'Jury Member B',
      statement: 'The completed recovery evidence was checked and may be scored.',
      appliedAt: '2026-09-03T00:03:01.000Z',
    };

    await applyQualificationRecoveryTransport(input);

    expect(applyQualificationRecoveryDirector).toHaveBeenCalledWith(input);
  });

  it('registers no-fire settlement as a separate recovery transport command', async () => {
    getSnapshot.mockReturnValue({
      connected: true,
      brokerUrl: 'mqtt://localhost:1883',
      activeCompetitionId: COMPETITION_ID,
      lanes: [],
      competitions: [
        {
          competitionId: COMPETITION_ID,
          competitionTypeId: 'P25',
          roundName: 'Qualification',
          phase: 'MATCH',
        },
      ],
      lastCommand: null,
    });
    const { applyQualificationRecoverySettlementTransport } = registerModule('P25');
    const input = {
      competitionId: COMPETITION_ID,
      laneId: '22222222-2222-4222-8222-222222222222',
      decisionId: '33333333-3333-4333-8333-333333333333',
      interruptionId: '44444444-4444-4444-8444-444444444444',
      stageIndex: 1,
      seriesIndex: 0,
      expectedMatchProgramId: 'P25_MATCH_PRECISION_240',
      expectedSeriesShotLimit: 5,
      expectedRecordedShots: 5,
      treatment: 'KEEP_RECORDED_SERIES' as const,
      decisionOfficialName: 'Jury Member A',
      decisionRuleReference: 'ISSF 8.8.1(c-d)',
      decidedAt: '2026-09-03T00:02:00.000Z',
      appliedBy: 'Jury Member B',
      statement: 'The full recorded series was checked and retained.',
      appliedAt: '2026-09-03T00:03:01.000Z',
    };

    await applyQualificationRecoverySettlementTransport(input);

    expect(settleQualificationRecoveryDirector).toHaveBeenCalledWith(input);
  });
});

describe('mqttModule firing-point projection', () => {
  it('emits Qualification recovery state and shot observations for the independent audit workflow', () => {
    const { emitEvent } = registerModule('P25');
    const state = { runId: '33333333-3333-4333-8333-333333333333' };
    const shot = { shotId: '44444444-4444-4444-8444-444444444444' };
    if (!directorCallbacks.onQualificationRecoveryStateObserved) {
      throw new Error('Qualification recovery state callback was not registered');
    }
    if (!directorCallbacks.onQualificationRecoveryShotObserved) {
      throw new Error('Qualification recovery shot callback was not registered');
    }

    directorCallbacks.onQualificationRecoveryStateObserved(state, JSON.stringify(state));
    directorCallbacks.onQualificationRecoveryShotObserved(shot, JSON.stringify(shot));

    expect(emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'QualificationRecoveryStateObserved', state }),
    );
    expect(emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'QualificationRecoveryShotObserved', shot }),
    );
  });

  it('lets a connected replacement use the alias number of an offline Lane', () => {
    const offlineLaneId = '44444444-4444-4444-8444-444444444444';
    const replacementLaneId = '55555555-5555-4555-8555-555555555555';
    const { emitEvent } = registerModule('BR60S');
    if (!directorCallbacks.onStateChanged) throw new Error('Director callback was not registered');

    directorCallbacks.onStateChanged({
      connected: true,
      brokerUrl: 'mqtt://localhost:1883',
      activeCompetitionId: null,
      competitions: [],
      lastCommand: null,
      lanes: [
        {
          laneId: offlineLaneId,
          laneAlias: 'Lane 1',
          hardware: { connection: { status: 'offline' } },
        },
        {
          laneId: replacementLaneId,
          laneAlias: 'Lane 1',
          hardware: { connection: { status: 'connected' } },
        },
      ],
    });

    expect(emitEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'MqttControlStateChanged',
        snapshot: expect.objectContaining({
          lanes: [
            expect.objectContaining({ laneId: offlineLaneId, firingPointNumber: null }),
            expect.objectContaining({ laneId: replacementLaneId, firingPointNumber: 1 }),
          ],
        }),
      }),
    );
  });
});

describe('mqttModule finishCompetition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSnapshot.mockReturnValue({
      connected: true,
      brokerUrl: 'mqtt://localhost:1883',
      activeCompetitionId: COMPETITION_ID,
      lanes: [],
      competitions: [{ competitionId: COMPETITION_ID, competitionTypeId: 'BR60S', phase: 'MATCH' }],
      lastCommand: null,
    });
    finishCompetition.mockResolvedValue({
      commandId: '33333333-3333-4333-8333-333333333333',
      action: 'finish-competition',
      success: true,
      lanes: [],
    });
  });

  it('rejects a mismatched result event before sending the finish command', async () => {
    const { handlers, queryEvent } = registerModule('BP60');

    await expect(
      handlers.finishCompetition({
        competitionId: COMPETITION_ID,
        resultContext: { eventId: EVENT_ID, relayNumber: 1 },
      }),
    ).rejects.toThrow(/uses competition type BP60.*active competition uses BR60S/);

    expect(queryEvent).toHaveBeenCalledWith(expect.anything(), { eventId: EVENT_ID });
    expect(finishCompetition).not.toHaveBeenCalled();
  });

  it('starts finishing after a matching result event passes validation', async () => {
    const { handlers } = registerModule('BR60S');

    await handlers.finishCompetition({
      competitionId: COMPETITION_ID,
      resultContext: { eventId: EVENT_ID, relayNumber: 1 },
    });

    expect(finishCompetition).toHaveBeenCalledWith(COMPETITION_ID, expect.any(Function), expect.any(Function));
  });

  it('rejects result publication before the match starts', async () => {
    getSnapshot.mockReturnValue({
      connected: true,
      brokerUrl: 'mqtt://localhost:1883',
      activeCompetitionId: COMPETITION_ID,
      lanes: [],
      competitions: [{ competitionId: COMPETITION_ID, competitionTypeId: 'BR60S', phase: 'SIGHTING' }],
      lastCommand: null,
    });
    const { handlers, publishResults, queryEvent } = registerModule('BR60S');

    await expect(
      handlers.finishCompetition({
        competitionId: COMPETITION_ID,
        resultContext: { eventId: EVENT_ID, relayNumber: 1 },
      }),
    ).rejects.toThrow(`Cannot publish results while competition ${COMPETITION_ID} is in phase SIGHTING`);

    expect(queryEvent).not.toHaveBeenCalled();
    expect(publishResults).not.toHaveBeenCalled();
    expect(finishCompetition).not.toHaveBeenCalled();
  });

  it('keeps finishing recoverable when the selected result event was deleted', async () => {
    const { handlers, publishResults, queryEvent } = registerModule(null);
    finishCompetition.mockImplementationOnce(async (_competitionId, beforeCleanup) => {
      expect(await beforeCleanup([])).toBe(false);
      return {
        commandId: '33333333-3333-4333-8333-333333333333',
        action: 'finish-competition',
        success: true,
        lanes: [],
      };
    });

    const response = await handlers.finishCompetition({
      competitionId: COMPETITION_ID,
      resultContext: { eventId: EVENT_ID, relayNumber: 1 },
    });

    expect(queryEvent).toHaveBeenCalledWith(expect.anything(), { eventId: EVENT_ID });
    expect(publishResults).toHaveBeenCalled();
    expect(response).toMatchObject({
      success: true,
      resultPublication: { savedCount: 0, errors: [`Event ${EVENT_ID} not found`] },
    });
  });

  it('finishes without a result snapshot barrier when no result event was selected', async () => {
    const { handlers, queryEvent } = registerModule('BR60S');

    await handlers.finishCompetition({ competitionId: COMPETITION_ID });

    expect(queryEvent).not.toHaveBeenCalled();
    expect(finishCompetition).toHaveBeenCalledWith(COMPETITION_ID, undefined, expect.any(Function));
  });

  it('passes the independent competition-data guard into cleanup', async () => {
    const { handlers, assertCompetitionDataAllowed } = registerModule('BR60S');
    finishCompetition.mockImplementationOnce(async (_competitionId, _beforeCleanup, beforeDataClear) => {
      beforeDataClear();
      return {
        commandId: '33333333-3333-4333-8333-333333333333',
        action: 'finish-competition',
        success: true,
        lanes: [],
      };
    });

    await handlers.finishCompetition({ competitionId: COMPETITION_ID });

    expect(assertCompetitionDataAllowed).toHaveBeenCalledWith({
      operation: 'CLEAR_COMPETITION_DATA',
      competitionId: COMPETITION_ID,
    });
  });

  it('does not repeat result validation after cleanup preparation was persisted', async () => {
    getSnapshot.mockReturnValue({
      connected: true,
      brokerUrl: 'mqtt://localhost:1883',
      activeCompetitionId: COMPETITION_ID,
      lanes: [],
      competitions: [
        {
          competitionId: COMPETITION_ID,
          competitionTypeId: 'BR60S',
          cleanupPreparedAt: '2026-08-27T00:00:00.000Z',
        },
      ],
      lastCommand: null,
    });
    const { handlers, queryEvent } = registerModule('BP60');

    await handlers.finishCompetition({
      competitionId: COMPETITION_ID,
      resultContext: { eventId: EVENT_ID, relayNumber: 1 },
    });

    expect(queryEvent).not.toHaveBeenCalled();
    expect(finishCompetition).toHaveBeenCalledWith(COMPETITION_ID, expect.any(Function), expect.any(Function));
  });
});
