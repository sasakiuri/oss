// SPDX-License-Identifier: MIT
import { describe, expect, it } from 'vitest';

import { assertCaseTransition, caseStatus, type CaseEntryType, type CaseStatus } from '@/main/domain/caseLifecycle';

const entries = (...types: CaseEntryType[]) => types.map((type) => ({ type }));

describe('caseStatus', () => {
  it.each<[CaseEntryType[], CaseStatus]>([
    [[], 'OPEN'],
    [['NOTE'], 'OPEN'],
    [['REFERRED', 'NOTE'], 'REFERRED'],
    [['REFERRED', 'RESOLVED'], 'RESOLVED'],
    [['RESOLVED', 'CLOSED'], 'CLOSED'],
    [['RESOLVED', 'CLOSED', 'REOPENED'], 'OPEN'],
    [['REFERRED', 'VOID', 'NOTE'], 'VOID'],
  ])('derives %j as %s', (types, status) => {
    expect(caseStatus(entries(...types))).toBe(status);
  });
});

describe('assertCaseTransition', () => {
  it.each<[CaseStatus, CaseEntryType]>([
    ['OPEN', 'NOTE'],
    ['OPEN', 'REFERRED'],
    ['OPEN', 'RESOLVED'],
    ['REFERRED', 'RESOLVED'],
    ['RESOLVED', 'REOPENED'],
    ['CLOSED', 'REOPENED'],
    ['RESOLVED', 'CLOSED'],
    ['REFERRED', 'VOID'],
    ['CLOSED', 'NOTE'],
  ])('allows %s -> %s', (status, next) => {
    expect(() => assertCaseTransition(status, next, 'protest case')).not.toThrow();
  });

  it.each<[CaseStatus, CaseEntryType, string]>([
    ['VOID', 'NOTE', 'A void protest case cannot be changed'],
    ['REFERRED', 'REFERRED', 'Only an open case can be referred'],
    ['RESOLVED', 'RESOLVED', 'Only an open or referred case can be resolved'],
    ['REFERRED', 'REOPENED', 'Only a resolved or closed case can be reopened'],
    ['OPEN', 'CLOSED', 'Resolve the case before closing it'],
    ['CLOSED', 'VOID', 'A closed case must be reopened before it can be voided'],
  ])('rejects %s -> %s', (status, next, message) => {
    expect(() => assertCaseTransition(status, next, 'protest case')).toThrow(message);
  });
});
