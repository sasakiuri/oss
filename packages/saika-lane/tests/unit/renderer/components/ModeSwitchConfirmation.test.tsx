// SPDX-License-Identifier: MIT
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from '@/renderer/presentation/App';
import { SideMenu } from '@/renderer/presentation/components/SideMenu';
import { useMainScreenKeyboardShortcuts } from '@/renderer/presentation/hooks/useMainScreenKeyboardShortcuts';
import type { MainScreenProps } from '@/renderer/presentation/screens/MainScreen';
import { useCompetitionStore } from '@/renderer/presentation/stores/competitionStore';
import { useDirectorMembershipStore } from '@/renderer/presentation/stores/directorMembershipStore';
import { useSessionStore } from '@/renderer/presentation/stores/sessionStore';
import type { ZoomMode } from '@/renderer/presentation/utils/zoomCalculator';
import { competitionService } from '@/renderer/services/competitionService';
import { sessionService } from '@/renderer/services/sessionService';
import type { ShotDto } from '@/shared/ipc/contracts';

const { onPrint, onZoom } = vi.hoisted(() => ({ onPrint: vi.fn(), onZoom: vi.fn() }));

vi.mock('@/renderer/presentation/hooks/useAppNavigation', () => ({ useAppNavigation: () => ({ screen: 'main' }) }));
vi.mock('@/renderer/presentation/hooks/useEventSubscriptions', () => ({ useEventSubscriptions: vi.fn() }));
vi.mock('@/renderer/presentation/hooks/useSavedSettingsRestore', () => ({ useSavedSettingsRestore: vi.fn() }));
vi.mock('@/renderer/presentation/stores/printStore', () => ({
  usePrintStore: { getState: () => ({ print: onPrint }) },
}));
vi.mock('@/renderer/services/competitionService', () => ({
  competitionService: {
    startCompetition: vi.fn(),
    startStage: vi.fn(),
    startNextSeries: vi.fn(),
    endStage: vi.fn(),
    advanceStage: vi.fn(),
    finishCompetition: vi.fn(),
  },
}));
vi.mock('@/renderer/services/sessionService', () => ({
  sessionService: { switchMode: vi.fn() },
}));

// Keep the real side-menu buttons and shortcut hooks while omitting unrelated screen contents.
vi.mock('@/renderer/presentation/screens/MainScreen', () => ({
  MainScreen: ({ modeSwitchActions }: MainScreenProps) => {
    const shots = useSessionStore((s) => s.shots);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
    const [zoomMode, setZoomMode] = useState<ZoomMode>('AUTO');
    const [, setSettingsInitialTab] = useState<'general' | 'target' | 'connection'>('general');
    useMainScreenKeyboardShortcuts({
      isSettingsModalOpen,
      setIsSettingsModalOpen,
      setSettingsInitialTab,
      setZoomMode,
      onZoomClick: onZoom,
    });
    return (
      <>
        <SideMenu
          onPreparationClick={modeSwitchActions.handlePreparationClick}
          onMatchClick={modeSwitchActions.handleMatchClick}
          onNextStageClick={modeSwitchActions.handleNextStageClick}
          onZoomClick={onZoom}
          onSettingsClick={() => setIsSettingsModalOpen(true)}
          onPrintClick={onPrint}
        />
        <output aria-label="Shot count">{shots.length}</output>
        <output aria-label="Settings open">{String(isSettingsModalOpen)}</output>
        <output aria-label="Zoom mode">{zoomMode}</output>
      </>
    );
  },
}));

const shot: ShotDto = {
  id: 'shot-1',
  shotNumber: 1,
  seriesNumber: 0,
  x: 0,
  y: 0,
  score: 100,
  innerTen: false,
  timestamp: '2026-10-29T00:00:00Z',
  mode: 'SIGHTING',
  isRecorded: false,
};

async function press(code: string, key?: string, repeat = false) {
  await act(async () => {
    fireEvent.keyDown(window, { code, key, repeat });
  });
}

async function click(name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name }));
  });
}

function expectNoAction() {
  expect(competitionService.startStage).not.toHaveBeenCalled();
  expect(competitionService.endStage).not.toHaveBeenCalled();
  expect(competitionService.advanceStage).not.toHaveBeenCalled();
  expect(competitionService.startNextSeries).not.toHaveBeenCalled();
  expect(sessionService.switchMode).not.toHaveBeenCalled();
}

function startCompetition(scored = false) {
  useCompetitionStore.getState().setCompetitionId('comp-1');
  useCompetitionStore.getState().setPhase('ACTIVE', 0, 0, scored ? 'Match' : 'Preparation', scored);
  useCompetitionStore.getState().setAthleteTargetControl(null);
}

describe('Preparation and Match confirmation through App', () => {
  beforeEach(() => {
    useDirectorMembershipStore.setState({ membership: { competitionId: null, revision: 0 }, hydrated: true });
    vi.useFakeTimers();
    vi.clearAllMocks();
    useCompetitionStore.getState().resetCompetition();
    useSessionStore.getState().resetSession();
    useSessionStore.getState().setSessionId('session-1');
    useSessionStore.getState().addShot(shot);
    vi.mocked(sessionService.switchMode).mockResolvedValue(undefined);
    vi.mocked(competitionService.startStage).mockResolvedValue({ sessionId: 'session-2' });
    vi.mocked(competitionService.endStage).mockResolvedValue(undefined);
    vi.mocked(competitionService.advanceStage).mockResolvedValue(undefined);
    vi.mocked(competitionService.startNextSeries).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    { label: 'Preparation', code: 'Numpad1', mode: 'SIGHTING' },
    { label: 'Match', code: 'Numpad2', mode: 'MATCH' },
  ])('shares one confirmation between $label clicks and keyboard actions', async ({ label, code, mode }) => {
    render(<App />);
    await click(label);
    expect(screen.getAllByRole('dialog', { name: 'Confirm mode change' })).toHaveLength(1);
    expect(screen.getByText(`Start a new ${label} series?`)).toBeVisible();
    expectNoAction();
    await press(code);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expectNoAction();

    await press(code);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    await click('Confirm');
    expect(sessionService.switchMode).toHaveBeenCalledExactlyOnceWith({ sessionId: 'session-1', mode });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    // The successful switch started an empty series, including a same-mode switch.
    await press(code);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(sessionService.switchMode).toHaveBeenCalledTimes(2);
    act(() => {
      useSessionStore.getState().addShot({ ...shot, id: 'shot-2', mode, shotNumber: 2 });
    });
    await press(code);
    expect(screen.getByRole('dialog')).toBeVisible();
    expect(sessionService.switchMode).toHaveBeenCalledTimes(2);
    await click('Cancel');
  });

  it('confirms a competition restart from a side-menu click', async () => {
    startCompetition();
    render(<App />);
    await click('Preparation');
    expect(screen.getByRole('dialog')).toBeVisible();
    expectNoAction();
    await click('Confirm');
    expect(competitionService.startStage).toHaveBeenCalledExactlyOnceWith({ competitionId: 'comp-1' });
  });

  it('confirms ending preparation from a side-menu click', async () => {
    startCompetition();
    render(<App />);
    await click('Match');
    expect(screen.getByRole('dialog')).toBeVisible();
    expectNoAction();
    await click('Confirm');
    expect(competitionService.endStage).toHaveBeenCalledExactlyOnceWith({ competitionId: 'comp-1' });
    expect(competitionService.advanceStage).toHaveBeenCalledExactlyOnceWith({ competitionId: 'comp-1' });
    expect(competitionService.startNextSeries).toHaveBeenCalledExactlyOnceWith({ competitionId: 'comp-1' });
  });

  it.each(['Enter', 'NumpadEnter'])('confirms a restart once with non-repeat %s', async (code) => {
    startCompetition(true);
    render(<App />);
    await press('Numpad1');
    expectNoAction();
    await press(code, 'Enter');
    expect(competitionService.startStage).toHaveBeenCalledExactlyOnceWith({ competitionId: 'comp-1' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await press(code, 'Enter');
    expect(competitionService.startStage).toHaveBeenCalledTimes(1);
  });

  it.each(['Enter', 'NumpadEnter'])(
    'does not repeat Preparation after confirming with held %s, and allows a new press after keyup',
    async (code) => {
      vi.useRealTimers();
      startCompetition();
      vi.mocked(competitionService.startStage).mockImplementation(async () => {
        useSessionStore.getState().clearSessionData();
        useSessionStore.getState().setSessionId('session-2');
        useCompetitionStore.getState().setPhase('IDLE', 0, 0, '', false);
        return { sessionId: 'session-2' };
      });
      const user = userEvent.setup({
        keyboardMap: [{ key: 'Enter', code }],
      });
      render(<App />);
      const opener = screen.getByRole('button', { name: 'Preparation' });
      await user.click(opener);
      expect(screen.getByRole('dialog')).toBeVisible();

      await user.keyboard(`[${code}>5]`);

      expect(opener).toHaveFocus();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(useSessionStore.getState().shots).toEqual([]);
      expect(competitionService.startStage).toHaveBeenCalledExactlyOnceWith({ competitionId: 'comp-1' });

      // Releasing another key must not end suppression of the held Enter.
      fireEvent.keyUp(opener, { code: 'Numpad9', key: '9' });
      const repeat = new KeyboardEvent('keydown', {
        code,
        key: 'Enter',
        repeat: true,
        bubbles: true,
        cancelable: true,
      });
      fireEvent(opener, repeat);
      expect(repeat.defaultPrevented).toBe(true);

      await user.keyboard(`[/${code}][${code}]`);
      expect(competitionService.startStage).toHaveBeenCalledTimes(2);
    },
  );

  it.each(['Enter', 'NumpadEnter'])('does not re-enter Match while the confirming %s remains held', async (code) => {
    vi.useRealTimers();
    startCompetition();
    vi.mocked(competitionService.endStage).mockImplementation(async () => {
      useCompetitionStore.getState().setPhase('SERIES_COMPLETE', 0, 0, 'Preparation', false);
    });
    vi.mocked(competitionService.advanceStage).mockImplementation(async () => {
      useCompetitionStore.getState().setPhase('STAGE_ENTERED', 1, 0, 'Match', true);
    });
    let completeSeries!: () => void;
    const seriesPending = new Promise<void>((resolve) => {
      completeSeries = resolve;
    });
    vi.mocked(competitionService.startNextSeries).mockReturnValue(seriesPending);
    const user = userEvent.setup({
      keyboardMap: [{ key: 'Enter', code }],
    });
    render(<App />);
    const opener = screen.getByRole('button', { name: 'Match' });
    await user.click(opener);
    expect(screen.getByRole('dialog')).toBeVisible();

    try {
      await user.keyboard(`[${code}>5]`);

      expect(opener).toHaveFocus();
      expect(opener).toBeEnabled();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(competitionService.endStage).toHaveBeenCalledExactlyOnceWith({ competitionId: 'comp-1' });
      expect(competitionService.advanceStage).toHaveBeenCalledExactlyOnceWith({ competitionId: 'comp-1' });
      expect(competitionService.startNextSeries).toHaveBeenCalledExactlyOnceWith({ competitionId: 'comp-1' });
      await user.keyboard(`[/${code}]`);
    } finally {
      await act(async () => {
        completeSeries();
        await seriesPending;
      });
    }
  });

  it('removes the held-Enter capture on unmount', async () => {
    startCompetition();
    const { unmount } = render(<App />);
    await click('Preparation');
    await press('Enter', 'Enter');
    unmount();
    const repeat = new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter', repeat: true, cancelable: true });
    window.dispatchEvent(repeat);
    expect(repeat.defaultPrevented).toBe(false);
  });

  it.each([
    ['Escape', 'Escape'],
    ['KeyA', 'a'],
    ['Numpad1', '1'],
    ['Numpad2', '2'],
    ['Numpad3', '3'],
    ['Numpad9', '9'],
    ['Numpad6', '6'],
    ['Numpad5', '5'],
    ['NumpadDecimal', '.'],
    ['F11', 'F11'],
    ['Tab', 'Tab'],
  ])('cancels and consumes %s without running its shortcut', async (code, key) => {
    startCompetition();
    render(<App />);
    await press('Numpad1');
    const event = new KeyboardEvent('keydown', { code, key, bubbles: true, cancelable: true });
    await act(async () => {
      window.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expectNoAction();
    expect(onPrint).not.toHaveBeenCalled();
    expect(onZoom).not.toHaveBeenCalled();
    expect(window.electronAPI.window.toggleFullscreen).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Settings open')).toHaveTextContent('false');
    expect(screen.getByLabelText('Zoom mode')).toHaveTextContent('AUTO');
  });

  it.each(['Enter', 'NumpadEnter', 'Escape', 'Numpad1', 'Numpad2', 'Numpad3', 'Numpad9', 'KeyA'])(
    'ignores repeat %s without confirming, cancelling, or extending the timeout',
    async (code) => {
      startCompetition();
      render(<App />);
      await press('Numpad1');
      act(() => {
        vi.advanceTimersByTime(4000);
      });
      await press(code, code === 'Escape' ? 'Escape' : code.includes('Enter') ? 'Enter' : 'a', true);
      expect(screen.getByRole('dialog')).toBeVisible();
      expectNoAction();
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expectNoAction();
      expect(onPrint).not.toHaveBeenCalled();
    },
  );

  it.each(['cancel button', 'close button', 'outside click'])(
    'cancels via %s and clears the pending action',
    async (method) => {
      render(<App />);
      await press('Numpad2');
      if (method === 'cancel button') await click('Cancel');
      else if (method === 'close button') await click('Close modal');
      else fireEvent.click(screen.getByRole('dialog'));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      await press('Enter', 'Enter');
      expectNoAction();
    },
  );

  it('cancels at five seconds without an answer and clears the pending action', async () => {
    render(<App />);
    await press('Numpad2');
    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(screen.getByRole('dialog')).toBeVisible();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await press('Enter', 'Enter');
    expectNoAction();
  });

  it.each(['competition ID', 'session ID', 'phase'])(
    'closes without acting if the %s changes while open',
    async (field) => {
      startCompetition();
      render(<App />);
      await press('Numpad1');
      act(() => {
        if (field === 'competition ID') useCompetitionStore.getState().setCompetitionId('comp-2');
        else if (field === 'session ID') useSessionStore.getState().setSessionId('session-2');
        else useCompetitionStore.getState().setPhase('SERIES_COMPLETE', 0, 0, 'Preparation', false);
      });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      await press('Enter', 'Enter');
      expectNoAction();
    },
  );

  it('keeps displaying arriving shots and timer changes while a confirmation is open', async () => {
    startCompetition();
    render(<App />);
    await press('Numpad2');
    act(() => {
      useSessionStore.getState().addShot({ ...shot, id: 'shot-2', shotNumber: 2 });
      useCompetitionStore.getState().updateTimer(30, 60);
    });
    expect(screen.getByLabelText('Shot count')).toHaveTextContent('2');
    expect(screen.getByRole('dialog')).toBeVisible();
    await press('NumpadEnter', 'Enter');
    expect(competitionService.endStage).toHaveBeenCalledExactlyOnceWith({ competitionId: 'comp-1' });
  });

  it('does not let an old timeout cancel a newly opened confirmation', async () => {
    render(<App />);
    await press('Numpad1');
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    await click('Cancel');
    await press('Numpad2');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByRole('dialog')).toBeVisible();
    await press('Enter', 'Enter');
    expect(sessionService.switchMode).toHaveBeenCalledExactlyOnceWith({ sessionId: 'session-1', mode: 'MATCH' });
  });

  it('focuses the dialog and restores focus to its opener on cancellation', async () => {
    render(<App />);
    const opener = screen.getByRole('button', { name: 'Preparation' });
    opener.focus();
    await click('Preparation');
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
    await press('Escape', 'Escape');
    expect(opener).toHaveFocus();
  });

  it('cleans up the confirmation key handler and timeout on unmount', async () => {
    const { unmount } = render(<App />);
    await press('Numpad1');
    unmount();
    const event = new KeyboardEvent('keydown', { code: 'Enter', key: 'Enter', cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expectNoAction();
  });
  it.each(['Preparation', 'Match'])('closes a pending %s confirmation when joining Director', async (label) => {
    startCompetition();
    render(<App />);
    await click(label);
    expect(screen.getByRole('dialog')).toBeVisible();
    act(() => {
      useDirectorMembershipStore.getState().applyChange({ competitionId: 'remote-1', revision: 1 });
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: label })).toBeDisabled();
    await press('Enter', 'Enter');
    expectNoAction();
  });

  it.each(['unknown', 'joined', 'failed'])(
    'locks progress through App while %s and preserves other shortcuts',
    async (status) => {
      startCompetition();
      useDirectorMembershipStore.setState({
        membership: status === 'joined' ? { competitionId: 'remote-1', revision: 1 } : null,
        hydrated: status === 'joined',
        hydrationFailed: status === 'failed',
      });
      render(<App />);
      for (const name of ['Preparation', 'Match', 'End Preparation'])
        expect(screen.getByRole('button', { name })).toBeDisabled();
      for (const code of ['Numpad1', 'Numpad2', 'Numpad3']) {
        const event = new KeyboardEvent('keydown', { code, cancelable: true });
        await act(async () => {
          window.dispatchEvent(event);
        });
        expect(event.defaultPrevented).toBe(true);
      }
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expectNoAction();
      await press('Numpad6');
      expect(onZoom).toHaveBeenCalledOnce();
      await press('Numpad9');
      expect(onPrint).toHaveBeenCalledOnce();
      await press('F11');
      expect(window.electronAPI.window.toggleFullscreen).toHaveBeenCalledOnce();
      await press('NumpadDecimal');
      expect(screen.getByLabelText('Settings open')).toHaveTextContent('true');
    },
  );
});
