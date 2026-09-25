import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createAlone,
  followOtherTabs,
  ownIsSaved,
  RETURN_ALERT_STORAGE_KEY,
  useReturnAlertStore,
  withSaved,
  type OwnPlan,
  type ReturnAlertSaved,
} from '@/app/(standalone)/labs/return-alert/_store';
import { SaveLockUnavailableError, useStorageStatus } from '@/lib/browser-storage';
import { useRecovery } from '@/lib/labs-session';

import { installFakeLocks } from '../support/fake-locks';

const own: OwnPlan = {
  planId: 'plan-1',
  ownerToken: 'owner-token',
  watchToken: 'watch-token',
  plan: { returnAt: '2999-01-01T00:00:00.000Z', graceMinutes: 30, note: '', watchers: 0, status: 'before' },
  armed: false,
};

describe('saving the keys of a new return plan before it is armed', () => {
  beforeEach(() => {
    useReturnAlertStore.setState(useReturnAlertStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });
  afterEach(() => vi.restoreAllMocks());

  it('confirms the keys once the browser has kept them', () => {
    useReturnAlertStore.getState().set({ own, watching: [] });
    expect(ownIsSaved(own)).toBe(true);
    expect(ownIsSaved({ ...own, ownerToken: 'another' })).toBe(false);
  });

  it('does not confirm keys the browser refused to keep, though the page still holds them (N1)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    useReturnAlertStore.getState().set({ own, watching: [] });
    expect(useReturnAlertStore.getState().value.own).toEqual(own);
    expect(ownIsSaved(own)).toBe(false);
  });

  it('does not confirm keys when the storage cannot be read', () => {
    useReturnAlertStore.getState().set({ own, watching: [] });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(ownIsSaved(own)).toBe(false);
  });
});

/** The browser's Web Locks (the shared test double), removed again by the returned function. */
function installLocks() {
  installFakeLocks();
  return () => Reflect.deleteProperty(navigator, 'locks');
}

/** Another tab's save: straight into the shared storage, not through this page's state. */
function saveFromAnotherTab(value: ReturnAlertSaved) {
  window.localStorage.setItem(RETURN_ALERT_STORAGE_KEY, JSON.stringify({ state: { value }, version: 0 }));
}

function storedValue(): ReturnAlertSaved | undefined {
  const raw = window.localStorage.getItem(RETURN_ALERT_STORAGE_KEY);
  return raw === null ? undefined : (JSON.parse(raw) as { state: { value: ReturnAlertSaved } }).state.value;
}

describe('making this device’s plan one at a time (T1)', () => {
  let removeLocks: () => void = () => undefined;
  beforeEach(() => {
    useReturnAlertStore.setState(useReturnAlertStore.getInitialState(), true);
    window.localStorage.clear();
    removeLocks = installLocks();
  });
  afterEach(() => {
    removeLocks();
    vi.restoreAllMocks();
  });

  it('lets a second creation (a double click, another tab) run only after the first, and not make a plan', async () => {
    const made: string[] = [];
    const make =
      (planId: string) =>
      async ({ update }: { update: (change: (saved: ReturnAlertSaved) => ReturnAlertSaved) => ReturnAlertSaved }) => {
        // The creation saves its plan (and arms it) before it lets go of the lock.
        await Promise.resolve();
        made.push(planId);
        update((saved) => ({ ...saved, own: { ...own, planId } }));
        return planId;
      };
    const [first, second] = await Promise.all([createAlone(make('p1')), createAlone(make('p2'))]);
    expect(first).toEqual({ ran: true, value: 'p1' });
    expect(second).toEqual({ ran: false, reason: 'exists' });
    expect(made).toEqual(['p1']);
  });

  it('sees a plan another tab saved, though this page had not read it', async () => {
    saveFromAnotherTab({ own, watching: [] });
    const work = vi.fn(async () => 'made');
    expect(await createAlone(work)).toEqual({ ran: false, reason: 'exists' });
    expect(work).not.toHaveBeenCalled();
  });

  it('makes no plan while the tools are read-only after a restore that could not be undone', async () => {
    useRecovery.setState({ result: 'failed' });
    try {
      const work = vi.fn(async () => 'made');
      expect(await createAlone(work)).toEqual({ ran: false, reason: 'readOnly' });
      expect(work).not.toHaveBeenCalled();
    } finally {
      useRecovery.setState({ result: 'none' });
    }
  });

  it('refuses to make a plan, or to save anything, where the browser cannot keep tabs apart', async () => {
    removeLocks();
    const work = vi.fn(async () => 'made');
    expect(await createAlone(work)).toEqual({ ran: false, reason: 'unsupported' });
    expect(work).not.toHaveBeenCalled();
    await expect(withSaved(async ({ update }) => update((saved) => saved))).rejects.toBeInstanceOf(
      SaveLockUnavailableError,
    );
  });
});

describe('saving changes over what other tabs saved (U1)', () => {
  let removeLocks: () => void = () => undefined;
  beforeEach(() => {
    useReturnAlertStore.setState(useReturnAlertStore.getInitialState(), true);
    window.localStorage.clear();
    removeLocks = installLocks();
  });
  afterEach(() => {
    removeLocks();
    vi.restoreAllMocks();
  });

  const watched = { planId: 'other-plan', token: 'watch', plan: own.plan };

  it('keeps the plan another tab saved when this tab, holding an older state, saves a change of its own', async () => {
    // This tab read the storage before the other tab made its plan, and still holds no plan.
    expect(useReturnAlertStore.getState().value.own).toBeNull();
    saveFromAnotherTab({ own: { ...own, armed: true }, watching: [] });
    await withSaved(async ({ update }) => update((saved) => ({ ...saved, watching: [...saved.watching, watched] })));
    const stored = storedValue();
    expect(stored?.own?.ownerToken).toBe(own.ownerToken);
    expect(stored?.watching).toEqual([watched]);
  });

  it('takes in what another tab saved as soon as it is saved, without writing it back', async () => {
    const stop = followOtherTabs();
    try {
      saveFromAnotherTab({ own, watching: [] });
      const setItem = vi.spyOn(Storage.prototype, 'setItem');
      window.dispatchEvent(new StorageEvent('storage', { key: RETURN_ALERT_STORAGE_KEY }));
      await vi.waitFor(() => expect(useReturnAlertStore.getState().value.own?.planId).toBe(own.planId));
      expect(setItem).not.toHaveBeenCalled();
    } finally {
      stop();
    }
  });

  it('does not write back what it reads outside the lock, so a read cannot undo another tab’s save', async () => {
    saveFromAnotherTab({ own, watching: [] });
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    await useReturnAlertStore.persist.rehydrate();
    expect(setItem).not.toHaveBeenCalled();
  });

  it('removes what has expired from the storage when saved under the lock', async () => {
    saveFromAnotherTab({ own: { ...own, plan: { ...own.plan, returnAt: '2000-01-01T00:00:00.000Z' } }, watching: [] });
    await withSaved(async ({ update }) => update((saved) => saved));
    expect(storedValue()?.own).toBeNull();
  });
});
