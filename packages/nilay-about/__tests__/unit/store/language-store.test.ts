import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { reportDiscardedSave, useStorageStatus } from '@/lib/browser-storage';
import { languageStorageKey, rehydrateLanguage, useLanguageStore } from '@/store';

const save = (key: string, state: unknown) => window.localStorage.setItem(key, JSON.stringify({ state, version: 0 }));

describe('the language the site is read in', () => {
  beforeEach(() => {
    useLanguageStore.setState({ language: 'ja' });
    window.localStorage.clear();
    useStorageStatus.setState({ available: true, discarded: [] });
  });
  afterEach(() => vi.restoreAllMocks());

  it('opens in Japanese', () => {
    expect(useLanguageStore.getState().language).toBe('ja');
  });

  it('remembers the choice for the next visit', async () => {
    useLanguageStore.getState().setLanguage('en');
    // Writing to the store saves it again, so the saved value is put back after the reset.
    const saved = window.localStorage.getItem(languageStorageKey)!;
    useLanguageStore.setState({ language: 'ja' });
    window.localStorage.setItem(languageStorageKey, saved);
    await rehydrateLanguage();
    expect(useLanguageStore.getState().language).toBe('en');
  });

  it('is one setting, so every screen asks the same store', () => {
    // There is no per-tool copy left to disagree with: a tool reads this one.
    useLanguageStore.getState().setLanguage('en');
    expect(useLanguageStore.getState().language).toBe('en');
    useLanguageStore.getState().setLanguage('ja');
    expect(useLanguageStore.getState().language).toBe('ja');
  });

  it('takes up the language a Labs tool was left in, the first time it is asked', async () => {
    // The tools each kept their own copy before the site had one; a reader who chose English in
    // one of them is not handed Japanese by the setting that replaced them.
    save('nilay-labs-recoil-v1', { language: 'en', settings: {} });
    await rehydrateLanguage();
    expect(useLanguageStore.getState().language).toBe('en');
  });

  it('reads the tools in a fixed order, so the same browser answers the same way', async () => {
    save('nilay-labs-zzz-v1', { language: 'ja' });
    save('nilay-labs-aaa-v1', { language: 'en' });
    await rehydrateLanguage();
    expect(useLanguageStore.getState().language).toBe('en');
  });

  it('passes over a tool whose save says nothing about the language', async () => {
    save('nilay-labs-aaa-v1', { settings: {} });
    window.localStorage.setItem('nilay-labs-bbb-v1', '{not json');
    save('nilay-labs-ccc-v1', { language: 'klingon' });
    save('nilay-labs-ddd-v1', { language: 'en' });
    await rehydrateLanguage();
    expect(useLanguageStore.getState().language).toBe('en');
  });

  it('leaves other keys of the browser alone', async () => {
    save('some-other-app', { language: 'en' });
    await rehydrateLanguage();
    expect(useLanguageStore.getState().language).toBe('ja');
  });

  it('stops looking at the tools once it has a choice of its own', async () => {
    useLanguageStore.getState().setLanguage('ja');
    const saved = window.localStorage.getItem(languageStorageKey)!;
    save('nilay-labs-recoil-v1', { language: 'en', settings: {} });
    useLanguageStore.setState({ language: 'en' });
    window.localStorage.setItem(languageStorageKey, saved);
    await rehydrateLanguage();
    // The saved Japanese is this setting's own answer, and it stands over the tool's older one.
    expect(useLanguageStore.getState().language).toBe('ja');
  });

  it('owns up to a saved language it cannot read', async () => {
    save(languageStorageKey, { language: 'klingon' });
    await rehydrateLanguage();
    expect(useLanguageStore.getState().language).toBe('ja');
    expect(useStorageStatus.getState().discarded).toEqual([languageStorageKey]);
  });

  it('says nothing on a first visit', async () => {
    await rehydrateLanguage();
    expect(useStorageStatus.getState().discarded).toEqual([]);
    expect(useLanguageStore.getState().language).toBe('ja');
  });

  it('speaks only for its own saved data', async () => {
    reportDiscardedSave('nilay-labs-other-tool-v1');
    await rehydrateLanguage();
    expect(useStorageStatus.getState().discarded).toEqual(['nilay-labs-other-tool-v1']);
  });

  it('remains usable when the browser will not keep it', async () => {
    vi.spyOn(window.Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    expect(() => useLanguageStore.getState().setLanguage('en')).not.toThrow();
    expect(useLanguageStore.getState().language).toBe('en');
    expect(useStorageStatus.getState().available).toBe(false);
  });

  it('reads through storage that throws on every access', async () => {
    vi.spyOn(window.Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('Denied', 'SecurityError');
    });
    await expect(rehydrateLanguage()).resolves.toBeUndefined();
    expect(useLanguageStore.getState().language).toBe('ja');
  });
});
