import { z } from 'zod';
import { create } from 'zustand';
import { persist, type PersistStorage } from 'zustand/middleware';

import { browserStorage, reportDiscardedSave } from '@/lib/browser-storage';

/**
 * The language the whole site is read in.
 *
 * It is one setting rather than one per page. A reader who picks English on the front page and
 * then opens a tool in Labs has said what they read in, and being asked again - or worse, being
 * answered in Japanese because that tool was never told - is the site contradicting itself.
 *
 * It lives in the browser rather than in the address, so a link is the same link whoever opens it
 * and the pages keep their single canonical URL. What that costs is a server render: the first
 * paint of a fresh visit is the Japanese one, and the choice is applied once the page has
 * hydrated. Nothing on this site is behind that flip, and no search engine is shown two pages of
 * the same content.
 */
export type Language = 'ja' | 'en';

export const languageStorageKey = 'nilay-language-v1';

/** The keys the Labs tools kept a language in before there was one setting for the site. */
const LEGACY_KEY_PREFIX = 'nilay-labs-';

const savedSchema = z.object({ language: z.enum(['ja', 'en']) });
type SavedState = z.infer<typeof savedSchema>;

interface LanguageStore {
  language: Language;
  setLanguage: (language: Language) => void;
}

export const useLanguageStore = create<LanguageStore>()(
  persist(
    (set) => ({
      language: 'ja',
      setLanguage: (language) => set({ language }),
    }),
    {
      name: languageStorageKey,
      storage: browserStorage as PersistStorage<SavedState>,
      skipHydration: true,
      partialize: (state) => ({ language: state.language }),
      merge: (saved, current) => {
        const parsed = savedSchema.safeParse(saved);
        if (parsed.success) return { ...current, language: parsed.data.language };
        // A first visit stores nothing, but unreadable data is a loss the site has to own up to.
        if (saved !== undefined) reportDiscardedSave(languageStorageKey);
        return current;
      },
    },
  ),
);

/**
 * The language a Labs tool was left in, from before the setting was shared.
 *
 * Every tool used to keep its own copy under its own key, so a reader who chose English in one of
 * them should not be handed Japanese by the site that replaced them. The keys are read in sorted
 * order so the same browser always adopts the same one, and anything unreadable is passed over:
 * this runs once, before there is anything of its own to lose.
 */
function legacyLanguage(): Language | null {
  try {
    const keys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key !== null && key.startsWith(LEGACY_KEY_PREFIX)) keys.push(key);
    }
    for (const key of keys.sort()) {
      const raw = window.localStorage.getItem(key);
      if (raw === null) continue;
      try {
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null || !('state' in parsed)) continue;
        const { state } = parsed as { state: unknown };
        if (typeof state !== 'object' || state === null || !('language' in state)) continue;
        const { language } = state as { language: unknown };
        if (language === 'ja' || language === 'en') return language;
      } catch {
        continue;
      }
    }
  } catch {
    // Storage that cannot be read at all is reported by the store's own read; nothing to adopt.
    return null;
  }
  return null;
}

/**
 * Read the saved language, once per page load.
 *
 * Every screen calls it - the site's own pages through the layout, a Labs tool alongside its own
 * settings - so that a tool does not paint in one language while the page around it is in another.
 * Calling it more than once is harmless: it reads the same storage and lands on the same state.
 */
export async function rehydrateLanguage(): Promise<void> {
  // Nothing here may throw. Every screen waits on this before it paints, and a browser that
  // refuses storage outright - a private window, a blocked origin - would otherwise leave the
  // page on its loading line for good.
  let fresh = false;
  try {
    fresh = typeof window !== 'undefined' && window.localStorage.getItem(languageStorageKey) === null;
  } catch {
    return;
  }
  try {
    await useLanguageStore.persist.rehydrate();
  } catch {
    return;
  }
  if (!fresh) return;
  const adopted = legacyLanguage();
  if (adopted !== null) useLanguageStore.setState({ language: adopted });
}

export const useLanguage = (): Language => useLanguageStore((state) => state.language);

export const useSetLanguage = (): ((language: Language) => void) => useLanguageStore((state) => state.setLanguage);
