import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createSavedStore, hasPassed } from '@/features/labs-notify/saved-store';

describe('saved credentials (m11)', () => {
  it('removes what has expired when the page reads the saved values, and from the storage too', async () => {
    const key = 'nilay-labs-saved-store-test';
    const schema = z.object({ items: z.array(z.object({ token: z.string(), expiresAt: z.string() })) });
    window.localStorage.setItem(
      key,
      JSON.stringify({
        state: {
          value: {
            items: [
              { token: 'old', expiresAt: '2000-01-01T00:00:00.000Z' },
              { token: 'live', expiresAt: '2999-01-01T00:00:00.000Z' },
            ],
          },
        },
        version: 0,
      }),
    );
    const store = createSavedStore(key, schema, { items: [] }, (value, nowMs) => ({
      items: value.items.filter((item) => !hasPassed(item.expiresAt, nowMs)),
    }));
    await store.persist.rehydrate();
    expect(store.getState().value.items.map((item) => item.token)).toEqual(['live']);
    expect(window.localStorage.getItem(key)).not.toContain('old');
  });
});
