// SPDX-License-Identifier: MIT
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import App from '@/renderer/presentation/App';
import type { UseSessionResult } from '@/renderer/presentation/hooks/useSession';
import * as useSessionModule from '@/renderer/presentation/hooks/useSession';

// Mock hooks
vi.mock('@/renderer/presentation/hooks/useSession');

vi.mock('@/renderer/presentation/hooks/useAudioPlayback', () => ({
  useAudioPlayback: vi.fn().mockReturnValue({
    playShotSound: vi.fn(),
    playTestSound: vi.fn(),
  }),
}));

vi.mock('@/renderer/presentation/hooks/useCompetition', () => ({
  useCompetition: vi.fn().mockReturnValue({
    startCompetition: vi.fn().mockResolvedValue({ competitionId: 'comp-1', sessionId: 'session-1' }),
    startStage: vi.fn().mockResolvedValue({ sessionId: 'session-1' }),
    endStage: vi.fn().mockResolvedValue(undefined),
    startNextSeries: vi.fn().mockResolvedValue(undefined),
    advanceStage: vi.fn().mockResolvedValue(undefined),
    finishCompetition: vi.fn().mockResolvedValue(undefined),
    loading: false,
    error: null,
  }),
}));

vi.mock('@/renderer/services/competitionService', () => ({
  competitionService: {
    startCompetition: vi.fn().mockResolvedValue({ competitionId: 'comp-1', sessionId: 'session-1' }),
    startStage: vi.fn().mockResolvedValue({ sessionId: 'session-1' }),
    endStage: vi.fn().mockResolvedValue({ success: true }),
    startNextSeries: vi.fn().mockResolvedValue({ success: true }),
    advanceStage: vi.fn().mockResolvedValue({ success: true }),
    finishCompetition: vi.fn().mockResolvedValue({ success: true }),
    getCompetitionState: vi.fn(),
    getCompetitionTypes: vi.fn().mockResolvedValue([]),
  },
}));

// useConnection was removed from App but may be used indirectly via useEventSubscriptions, so keep the mock
vi.mock('@/renderer/presentation/hooks/useConnection', () => ({
  useConnection: vi.fn().mockReturnValue({
    status: 'disconnected',
    connectionId: null,
    portName: null,
    manufacturer: null,
    connect: vi.fn(),
    disconnect: vi.fn(),
    isConnecting: false,
    isDisconnecting: false,
    error: null,
    clearError: vi.fn(),
  }),
}));

// Mock screen components
vi.mock('@/renderer/presentation/screens/SplashScreen', () => ({
  SplashScreen: ({ version }: { version: string }) => <div data-testid="splash-screen">SplashScreen (v{version})</div>,
}));

vi.mock('@/renderer/presentation/screens/MainScreen', () => ({
  MainScreen: () => <div data-testid="main-screen">MainScreen</div>,
}));

describe('App', () => {
  const defaultMockSession: UseSessionResult = {
    currentSessionId: null,
    mode: 'SIGHTING',
    totalScore: 0,
    seriesScores: [],
    startSession: vi.fn().mockResolvedValue(undefined),
    switchMode: vi.fn(),
    resetSession: vi.fn(),
    isStarting: false,
    isSwitching: false,
    isResetting: false,
    error: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useSessionModule.useSession).mockReturnValue(defaultMockSession);
  });

  describe('basic rendering', () => {
    it('renders the App component correctly', () => {
      render(<App />);

      // Initial screen is SplashScreen
      expect(screen.getByTestId('splash-screen')).toBeInTheDocument();
    });

    it('displays SplashScreen in initial state', () => {
      render(<App />);

      expect(screen.getByTestId('splash-screen')).toBeInTheDocument();
      expect(screen.queryByTestId('main-screen')).not.toBeInTheDocument();
    });

    it('passes the version to SplashScreen', () => {
      render(<App />);

      expect(screen.getByText('SplashScreen (v0.1.0)')).toBeInTheDocument();
    });
  });

  describe('screen transition: Splash -> Main (timer test)', () => {
    it('transitions to MainScreen after 2 second timer', async () => {
      vi.useFakeTimers();
      render(<App />);

      // Initial state is SplashScreen
      expect(screen.getByTestId('splash-screen')).toBeInTheDocument();

      // Advance 2 seconds
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      // Transitioned to MainScreen
      expect(screen.getByTestId('main-screen')).toBeInTheDocument();

      vi.useRealTimers();
    });

    it('does not transition to MainScreen before 2 seconds', () => {
      vi.useFakeTimers();
      render(<App />);

      // Advance 1 second
      vi.advanceTimersByTime(1000);

      // Still SplashScreen
      expect(screen.getByTestId('splash-screen')).toBeInTheDocument();
      expect(screen.queryByTestId('main-screen')).not.toBeInTheDocument();

      vi.useRealTimers();
    });

    it('timer is cleared on unmount', () => {
      vi.useFakeTimers();
      const { unmount } = render(<App />);

      // Unmount before timer fires
      unmount();

      // Advancing timer does not error
      expect(() => {
        vi.advanceTimersByTime(2000);
      }).not.toThrow();

      vi.useRealTimers();
    });
  });

  describe('keyboard shortcut: Numpad3 (Next Stage)', () => {
    it('pressing Numpad3 on MainScreen calls NextStage (does nothing in non-competition mode)', async () => {
      vi.useFakeTimers();
      render(<App />);
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      vi.useRealTimers();

      // Press Numpad3 - handleNextStageClick does nothing in non-competition mode
      fireEvent.keyDown(window, { code: 'Numpad3' });

      // Verify no error occurs
      expect(screen.getByTestId('main-screen')).toBeInTheDocument();
    });
  });

  describe('keyboard shortcut: F11 (fullscreen)', () => {
    it('pressing F11 toggles fullscreen on any screen', () => {
      vi.mocked(window.electronAPI.window.toggleFullscreen).mockResolvedValue({
        success: true,
        data: { isFullscreen: true },
      });

      render(<App />);

      fireEvent.keyDown(window, { code: 'F11' });

      expect(window.electronAPI.window.toggleFullscreen).toHaveBeenCalledTimes(1);
    });

    it('does not toggle fullscreen with NumpadEnter', () => {
      render(<App />);

      fireEvent.keyDown(window, { code: 'NumpadEnter' });

      expect(window.electronAPI.window.toggleFullscreen).not.toHaveBeenCalled();
    });
  });

  describe('keyboard shortcut: Numpad1/Numpad2 (Mode Switch)', () => {
    it('pressing Numpad2 on MainScreen switches to MATCH mode', async () => {
      const mockSwitchMode = vi.fn().mockResolvedValue(undefined);
      vi.mocked(useSessionModule.useSession).mockReturnValue({
        ...defaultMockSession,
        mode: 'SIGHTING',
        switchMode: mockSwitchMode,
      });

      vi.useFakeTimers();
      render(<App />);
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      vi.useRealTimers();

      // Press Numpad2
      fireEvent.keyDown(window, { code: 'Numpad2' });

      await waitFor(() => {
        expect(mockSwitchMode).toHaveBeenCalledWith('MATCH');
      });
    });

    it('pressing Numpad1 on MainScreen switches to SIGHTING mode', async () => {
      const mockSwitchMode = vi.fn().mockResolvedValue(undefined);
      vi.mocked(useSessionModule.useSession).mockReturnValue({
        ...defaultMockSession,
        mode: 'MATCH',
        switchMode: mockSwitchMode,
      });

      vi.useFakeTimers();
      render(<App />);
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      vi.useRealTimers();

      // Press Numpad1
      fireEvent.keyDown(window, { code: 'Numpad1' });

      await waitFor(() => {
        expect(mockSwitchMode).toHaveBeenCalledWith('SIGHTING');
      });
    });

    it('mode switch errors are silently handled', async () => {
      const mockSwitchMode = vi.fn().mockRejectedValue(new Error('Switch mode failed'));

      vi.mocked(useSessionModule.useSession).mockReturnValue({
        ...defaultMockSession,
        switchMode: mockSwitchMode,
      });

      vi.useFakeTimers();
      render(<App />);
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      vi.useRealTimers();

      // Press Numpad1 - verify error does not propagate
      fireEvent.keyDown(window, { code: 'Numpad1' });

      await waitFor(() => {
        expect(mockSwitchMode).toHaveBeenCalled();
      });
    });
  });

  describe('event listener cleanup', () => {
    it('removes keyboard event listener on unmount', () => {
      const removeEventListenerSpy = vi.spyOn(window, 'removeEventListener');

      const { unmount } = render(<App />);

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));

      removeEventListenerSpy.mockRestore();
    });
  });

  describe('edge cases', () => {
    it('can render without props', () => {
      expect(() => {
        render(<App />);
      }).not.toThrow();
    });

    it('works correctly with multiple re-renders', () => {
      const { rerender } = render(<App />);

      rerender(<App />);
      rerender(<App />);

      expect(screen.getByTestId('splash-screen')).toBeInTheDocument();
    });
  });

  describe('type safety', () => {
    it('SessionMode type is correctly used', async () => {
      const mockSwitchMode = vi.fn().mockResolvedValue(undefined);

      vi.mocked(useSessionModule.useSession).mockReturnValue({
        ...defaultMockSession,
        mode: 'SIGHTING',
        switchMode: mockSwitchMode,
      });

      vi.useFakeTimers();
      render(<App />);
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });
      vi.useRealTimers();

      // Switch to MATCH mode with Numpad2
      fireEvent.keyDown(window, { code: 'Numpad2' });

      await waitFor(() => {
        // Type-safe mode switch
        expect(mockSwitchMode).toHaveBeenCalledWith('MATCH');
      });
    });
  });
});
