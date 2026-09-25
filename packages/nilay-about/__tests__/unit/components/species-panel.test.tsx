import { act, screen } from '@testing-library/react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SpeciesPanel } from '@/app/(standalone)/labs/trail-camera/species-panel';
import { downloadModel, isModelCached, modelCacheAvailable } from '@/lib/model-download';

vi.mock('@/lib/model-download');

let root: Root | undefined;
let container: HTMLDivElement;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isModelCached).mockResolvedValue(false);
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  container.remove();
});

describe('species panel hydration', () => {
  it.each([true, false])('hydrates without an error when browser cache availability is %s', async (available) => {
    const panel = <SpeciesPanel language="en" photos={[]} onChange={vi.fn()} />;
    vi.mocked(modelCacheAvailable).mockReturnValue(false);
    container.innerHTML = renderToString(panel);
    vi.mocked(modelCacheAvailable).mockReturnValue(available);
    const onRecoverableError = vi.fn();
    await act(async () => {
      root = hydrateRoot(container, panel, { onRecoverableError });
    });
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(screen.queryAllByText('This browser cannot keep the model; it is downloaded on every run.')).toHaveLength(
      available ? 0 : 1,
    );
    expect(downloadModel).not.toHaveBeenCalled();
  });
});
