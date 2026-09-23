import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';

import { TRAP_TAG_STORAGE_KEY, useTrapTagStore } from '@/app/(standalone)/labs/trap-tag/_store';
import { useStorageStatus } from '@/lib/browser-storage';
import { emptyTrapTagDraft } from '@/lib/schemas/trap-tag';

const ADDRESS = '東京都千代田区霞が関1-2-2';
const NAME = '山田太郎';

const saveSession = (state: Record<string, unknown>) =>
  window.localStorage.setItem(TRAP_TAG_STORAGE_KEY, JSON.stringify({ state, version: 0 }));

describe('trap tag input and its storage', () => {
  beforeEach(() => {
    useTrapTagStore.setState(useTrapTagStore.getInitialState(), true);
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });
  afterEach(() => vi.restoreAllMocks());

  it('keeps the address and the name out of storage by default', () => {
    const store = useTrapTagStore.getState();
    expect(store.remember).toBe(false);
    store.setField('address', ADDRESS);
    store.setField('name', NAME);
    store.setCopies(4);
    const saved = window.localStorage.getItem(TRAP_TAG_STORAGE_KEY);
    expect(saved).toContain('"copies":4');
    expect(saved).not.toContain(NAME);
    expect(saved).not.toContain('霞が関');
    expect(useTrapTagStore.getState().fields).toMatchObject({ address: ADDRESS, name: NAME, governor: '' });
  });

  it('writes the input only while saving is switched on', () => {
    const store = useTrapTagStore.getState();
    store.setField('address', ADDRESS);
    store.setField('name', NAME);
    store.setRemember(true);
    expect(window.localStorage.getItem(TRAP_TAG_STORAGE_KEY)).toContain(NAME);
    store.setRemember(false);
    const saved = window.localStorage.getItem(TRAP_TAG_STORAGE_KEY);
    expect(saved).not.toContain(NAME);
    expect(saved).not.toContain('霞が関');
    // Switching off removes the stored copy without clearing the form.
    expect(useTrapTagStore.getState().fields.name).toBe(NAME);
  });

  it('deletes the stored session and the current input on request', () => {
    const store = useTrapTagStore.getState();
    store.setField('name', NAME);
    store.setRemember(true);
    store.clearSaved();
    expect(window.localStorage.getItem(TRAP_TAG_STORAGE_KEY)).toBeNull();
    expect(useTrapTagStore.getState()).toMatchObject({ remember: false, fields: emptyTrapTagDraft });
  });

  it('restores a saved session after a fresh visit', async () => {
    const store = useTrapTagStore.getState();
    store.setPurpose('permit');
    store.setCharSizeMm(12);
    store.setField('address', ADDRESS);
    store.setRemember(true);
    const saved = window.localStorage.getItem(TRAP_TAG_STORAGE_KEY)!;
    useTrapTagStore.setState(useTrapTagStore.getInitialState(), true);
    window.localStorage.setItem(TRAP_TAG_STORAGE_KEY, saved);
    await useTrapTagStore.persist.rehydrate();
    expect(useTrapTagStore.getState()).toMatchObject({
      purpose: 'permit',
      charSizeMm: 12,
      remember: true,
      fields: { address: ADDRESS },
    });
  });

  it('ignores input found in a session that was stored without permission', async () => {
    saveSession({
      language: 'ja',
      purpose: 'hunting',
      charSizeMm: 10,
      copies: 1,
      remember: false,
      fields: { ...emptyTrapTagDraft, address: ADDRESS, name: NAME },
    });
    await useTrapTagStore.persist.rehydrate();
    expect(useTrapTagStore.getState().fields).toEqual(emptyTrapTagDraft);
    // Dropping input that was never allowed to be stored is not a lost setting.
    expect(useStorageStatus.getState().discarded).not.toContain(TRAP_TAG_STORAGE_KEY);
  });

  it('keeps quiet on a first visit, when nothing is stored yet', async () => {
    await useTrapTagStore.persist.rehydrate();
    expect(useTrapTagStore.getState()).toMatchObject({ charSizeMm: 10 });
    expect(useStorageStatus.getState().discarded).not.toContain(TRAP_TAG_STORAGE_KEY);
  });

  it('ignores invalid saved shapes', async () => {
    saveSession({ language: 'en', purpose: 'unknown', charSizeMm: 10, copies: 1, remember: true });
    await useTrapTagStore.persist.rehydrate();
    expect(useTrapTagStore.getState()).toMatchObject({ purpose: 'hunting' });
    saveSession({
      language: 'ja',
      purpose: 'hunting',
      charSizeMm: 10,
      copies: 1,
      remember: true,
      fields: { address: 'あ'.repeat(200) },
    });
    await useTrapTagStore.persist.rehydrate();
    expect(useTrapTagStore.getState().fields).toEqual(emptyTrapTagDraft);
    // The settings did not simply vanish: the tool can say why it started over.
    expect(useStorageStatus.getState().discarded).toEqual([TRAP_TAG_STORAGE_KEY]);
  });

  it('discards a saved session whose print options are not on offer', async () => {
    saveSession({ language: 'ja', purpose: 'hunting', charSizeMm: 7, copies: 3, remember: false });
    await useTrapTagStore.persist.rehydrate();
    expect(useTrapTagStore.getState()).toMatchObject({ charSizeMm: 10, copies: 1 });
    // Reverting to the defaults is visible to the person instead of silent.
    expect(useStorageStatus.getState().discarded).toEqual([TRAP_TAG_STORAGE_KEY]);
  });

  it('keeps a saved session that holds offered print options', async () => {
    saveSession({ language: 'ja', purpose: 'hunting', charSizeMm: 15, copies: 6, remember: false });
    await useTrapTagStore.persist.rehydrate();
    expect(useTrapTagStore.getState()).toMatchObject({ charSizeMm: 15, copies: 6 });
    expect(useStorageStatus.getState().discarded).not.toContain(TRAP_TAG_STORAGE_KEY);
  });

  it('remains usable when browser storage rejects writes', () => {
    vi.spyOn(window.Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    expect(() => useTrapTagStore.getState().setField('name', NAME)).not.toThrow();
    expect(useTrapTagStore.getState().fields.name).toBe(NAME);
    expect(useStorageStatus.getState().available).toBe(false);
  });
});
