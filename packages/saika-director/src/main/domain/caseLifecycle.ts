// SPDX-License-Identifier: MIT

/** Entry types of a case that officials refer, resolve, reopen, close or void. */
export const CASE_ENTRY_TYPES = ['NOTE', 'REFERRED', 'RESOLVED', 'REOPENED', 'CLOSED', 'VOID'] as const;

export type CaseEntryType = (typeof CASE_ENTRY_TYPES)[number];
export type CaseStatus = 'OPEN' | 'REFERRED' | 'RESOLVED' | 'CLOSED' | 'VOID';

/** Returns the status that the entries, in recorded order, leave the case in. */
export function caseStatus(entries: readonly { readonly type: CaseEntryType }[]): CaseStatus {
  let status: CaseStatus = 'OPEN';
  for (const entry of entries) {
    switch (entry.type) {
      case 'REFERRED':
        status = 'REFERRED';
        break;
      case 'RESOLVED':
        status = 'RESOLVED';
        break;
      case 'REOPENED':
        status = 'OPEN';
        break;
      case 'CLOSED':
        status = 'CLOSED';
        break;
      case 'VOID':
        status = 'VOID';
        break;
      case 'NOTE':
        break;
    }
  }
  return status;
}

/** Throws when a case in `status` cannot take a `next` entry; `noun` names the case in the void message. */
export function assertCaseTransition(status: CaseStatus, next: CaseEntryType, noun: string): void {
  if (status === 'VOID') throw new Error(`A void ${noun} cannot be changed`);
  if (next === 'REFERRED' && status !== 'OPEN') throw new Error('Only an open case can be referred');
  if (next === 'RESOLVED' && status !== 'OPEN' && status !== 'REFERRED') {
    throw new Error('Only an open or referred case can be resolved');
  }
  if (next === 'REOPENED' && status !== 'RESOLVED' && status !== 'CLOSED') {
    throw new Error('Only a resolved or closed case can be reopened');
  }
  if (next === 'CLOSED' && status !== 'RESOLVED') throw new Error('Resolve the case before closing it');
  if (next === 'VOID' && status === 'CLOSED') throw new Error('A closed case must be reopened before it can be voided');
}
