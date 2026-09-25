import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AntlerMeasureClient } from '@/app/(standalone)/labs/antler-measure/antler-measure-client';
import { useLanguageStore } from '@/store';

vi.mock('@/components/labs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/labs')>();
  const { createElement } = await import('react');
  return {
    ...actual,
    AppLayout: ({ header, children }: { header: ReactNode; children: ReactNode }) =>
      createElement('div', null, header, children),
    AppHeader: ({ title }: { title: string }) => createElement('header', null, title),
    LanguageMenu: () => null,
  };
});

let photo: {
  onload: (() => void) | null;
  onerror: (() => void) | null;
  naturalWidth: number;
  naturalHeight: number;
  src: string;
};
const createObjectURL = vi.fn();
const revokeObjectURL = vi.fn();
const upload = (name = 'antler.jpg') =>
  fireEvent.change(document.querySelector('input[type="file"]')!, {
    target: { files: [new File(['photo'], name, { type: 'image/jpeg' })] },
  });

beforeEach(() => {
  window.localStorage.clear();
  useLanguageStore.setState({ language: 'en' });
  vi.stubGlobal('PointerEvent', MouseEvent);
  vi.stubGlobal(
    'Image',
    vi.fn(function () {
      photo = { onload: null, onerror: null, naturalWidth: 800, naturalHeight: 600, src: '' };
      return photo;
    }),
  );
  createObjectURL.mockReset().mockReturnValue('blob:test-photo');
  revokeObjectURL.mockReset();
  vi.stubGlobal('URL', Object.assign(class extends URL {}, { createObjectURL, revokeObjectURL }));
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('antler photo measurement', () => {
  it('scales image coordinates, follows a curved measurement, undoes and removes it', async () => {
    const view = render(<AntlerMeasureClient />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Choose a photo' })).toBeEnabled());
    upload();
    act(() => photo.onload!());
    const svg = document.querySelector('svg[viewBox="0 0 800 600"]')!;
    vi.spyOn(svg, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 400, height: 300 } as DOMRect);
    const tap = (clientX: number, clientY: number) => fireEvent.pointerDown(svg, { clientX, clientY });
    fireEvent.change(screen.getByLabelText(/Reference length/), { target: { value: '20' } });
    tap(20, 20);
    tap(120, 20);
    expect(screen.getByText('Scale: 1 cm = 10 pixels')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add a measure' }));
    tap(20, 40);
    tap(95, 40);
    tap(95, 90);
    expect(screen.getByText('25 cm')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo the last point' }));
    expect(screen.getByText('15 cm')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Name of measure 1'), { target: { value: 'Left beam' } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove Left beam' }));
    expect(screen.queryByLabelText('Name of measure 1')).not.toBeInTheDocument();
    expect(screen.getByText('Tap the photo: the two ends of the reference')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo the last point' }));
    expect(screen.getByText('Scale: not set')).toBeInTheDocument();
    view.unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-photo');
  });

  it('releases an unreadable file and resets measurements when a new photo is chosen', async () => {
    render(<AntlerMeasureClient />);
    await waitFor(() => expect(document.querySelector('[aria-busy="true"]')).toBeNull());
    upload('broken.jpg');
    act(() => photo.onerror!());
    expect(screen.getByText('The file could not be read as a picture.')).toBeInTheDocument();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-photo');
    upload();
    act(() => photo.onload!());
    fireEvent.click(screen.getByRole('button', { name: 'Add a measure' }));
    expect(screen.getByLabelText('Name of measure 1')).toBeInTheDocument();
    createObjectURL.mockReturnValue('blob:replacement-photo');
    upload('replacement.jpg');
    act(() => photo.onload!());
    expect(screen.queryByLabelText('Name of measure 1')).not.toBeInTheDocument();
    expect(screen.queryByText('The file could not be read as a picture.')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'The photo being measured' })).toHaveAttribute(
      'src',
      'blob:replacement-photo',
    );
  });
});
