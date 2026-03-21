// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import type { Phase } from '@/main/modules/competition/domain/Phase';
import { MqttLanePhase } from '@/main/modules/mqtt/domain/MqttLanePhase';
import { mapToLanePhase, type PhaseMapperContext } from '@/main/modules/mqtt/domain/PhaseMapper';

describe('mapToLanePhase', () => {
  // ── OFFLINE ──

  describe('isConnected = false', () => {
    const allPhases: Phase[] = ['IDLE', 'ACTIVE', 'SERIES_COMPLETE', 'SERIES_ENTERED', 'STAGE_ENTERED', 'FINISHED'];

    it.each(allPhases)('returns OFFLINE regardless of internal phase %s', (phase) => {
      const result = mapToLanePhase(phase, { isConnected: false, scored: true });
      expect(result).toBe(MqttLanePhase.OFFLINE);
    });
  });

  // ── IDLE ──

  describe('IDLE phase', () => {
    it('returns READY with scored=false', () => {
      expect(mapToLanePhase('IDLE', { isConnected: true, scored: false })).toBe(MqttLanePhase.READY);
    });

    it('returns READY with scored=true', () => {
      expect(mapToLanePhase('IDLE', { isConnected: true, scored: true })).toBe(MqttLanePhase.READY);
    });
  });

  // ── ACTIVE ──

  describe('ACTIVE phase', () => {
    it('returns SIGHTING when scored is false', () => {
      expect(mapToLanePhase('ACTIVE', { isConnected: true, scored: false })).toBe(MqttLanePhase.SIGHTING);
    });

    it('returns MATCH when scored is true', () => {
      expect(mapToLanePhase('ACTIVE', { isConnected: true, scored: true })).toBe(MqttLanePhase.MATCH);
    });
  });

  // ── SERIES_COMPLETE ──

  describe('SERIES_COMPLETE phase', () => {
    it('returns SERIES_COMPLETE when competition is not finished', () => {
      expect(mapToLanePhase('SERIES_COMPLETE', { isConnected: true, scored: true, isCompetitionFinished: false })).toBe(
        MqttLanePhase.SERIES_COMPLETE,
      );
    });

    it('returns SERIES_COMPLETE when isCompetitionFinished is undefined', () => {
      expect(mapToLanePhase('SERIES_COMPLETE', { isConnected: true, scored: true })).toBe(
        MqttLanePhase.SERIES_COMPLETE,
      );
    });

    it('returns FINISHED when competition is finished', () => {
      expect(mapToLanePhase('SERIES_COMPLETE', { isConnected: true, scored: true, isCompetitionFinished: true })).toBe(
        MqttLanePhase.FINISHED,
      );
    });
  });

  // ── SERIES_ENTERED ──

  describe('SERIES_ENTERED phase', () => {
    it('returns SERIES_COMPLETE', () => {
      expect(mapToLanePhase('SERIES_ENTERED', { isConnected: true, scored: true })).toBe(MqttLanePhase.SERIES_COMPLETE);
    });

    it('returns SERIES_COMPLETE regardless of scored flag', () => {
      expect(mapToLanePhase('SERIES_ENTERED', { isConnected: true, scored: true })).toBe(MqttLanePhase.SERIES_COMPLETE);
    });
  });

  // ── STAGE_ENTERED ──

  describe('STAGE_ENTERED phase', () => {
    it('returns STAGE_COMPLETE', () => {
      expect(mapToLanePhase('STAGE_ENTERED', { isConnected: true, scored: true })).toBe(MqttLanePhase.STAGE_COMPLETE);
    });

    it('returns STAGE_COMPLETE regardless of scored flag', () => {
      expect(mapToLanePhase('STAGE_ENTERED', { isConnected: true, scored: true })).toBe(MqttLanePhase.STAGE_COMPLETE);
    });
  });

  // ── FINISHED ──

  describe('FINISHED phase', () => {
    it('returns FINISHED', () => {
      expect(mapToLanePhase('FINISHED', { isConnected: true, scored: true })).toBe(MqttLanePhase.FINISHED);
    });

    it('returns FINISHED regardless of context', () => {
      expect(
        mapToLanePhase('FINISHED', {
          isConnected: true,
          scored: false,
          isCompetitionFinished: false,
        }),
      ).toBe(MqttLanePhase.FINISHED);
    });
  });

  // ── isConnected undefined (default = connected) ──

  describe('isConnected undefined (treated as connected)', () => {
    it('returns READY for IDLE', () => {
      expect(mapToLanePhase('IDLE', { scored: true })).toBe(MqttLanePhase.READY);
    });

    it('returns MATCH for ACTIVE with scored=true', () => {
      expect(mapToLanePhase('ACTIVE', { scored: true })).toBe(MqttLanePhase.MATCH);
    });
  });

  // ── Exhaustiveness ──

  describe('exhaustiveness', () => {
    const mappings: [Phase, PhaseMapperContext, MqttLanePhase][] = [
      ['IDLE', { isConnected: true, scored: true }, MqttLanePhase.READY],
      ['ACTIVE', { isConnected: true, scored: false }, MqttLanePhase.SIGHTING],
      ['ACTIVE', { isConnected: true, scored: true }, MqttLanePhase.MATCH],
      ['SERIES_COMPLETE', { isConnected: true, scored: true }, MqttLanePhase.SERIES_COMPLETE],
      ['SERIES_ENTERED', { isConnected: true, scored: true }, MqttLanePhase.SERIES_COMPLETE],
      ['STAGE_ENTERED', { isConnected: true, scored: true }, MqttLanePhase.STAGE_COMPLETE],
      ['FINISHED', { isConnected: true, scored: true }, MqttLanePhase.FINISHED],
    ];

    it.each(mappings)('maps %s with context %j to %s', (phase, context, expected) => {
      expect(mapToLanePhase(phase, context)).toBe(expected);
    });
  });
});
