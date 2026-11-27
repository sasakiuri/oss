// SPDX-License-Identifier: MIT
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import type { UseShotResult } from '@/renderer/presentation/hooks/useShot';
import * as useShotModule from '@/renderer/presentation/hooks/useShot';
import { MainScreen } from '@/renderer/presentation/screens/MainScreen';
import { useCompetitionStore } from '@/renderer/presentation/stores/competitionStore';
import { useConnectionNotificationStore } from '@/renderer/presentation/stores/connectionNotificationStore';
import * as useConnectionStoreModule from '@/renderer/presentation/stores/connectionStore';
import * as useSessionStoreModule from '@/renderer/presentation/stores/sessionStore';
import type { ShotDto } from '@/shared/ipc/contracts';

// Mock useTitleBar to prevent async state updates from windowService.getWindowState()
vi.mock('@/renderer/presentation/hooks/useTitleBar', () => ({
  useTitleBar: () => ({
    isMaximized: false,
    isFullscreen: false,
    handleMinimize: vi.fn(),
    handleMaximize: vi.fn(),
    handleClose: vi.fn(),
    handleToggleFullscreen: vi.fn(),
  }),
}));

// Helper to filter out non-DOM-safe props from spread
const NON_DOM_PROPS = new Set([
  'isOpen',
  'onClose',
  'isConnected',
  'onZoomClick',
  'onPreparationClick',
  'onMatchClick',
  'onNextStageClick',
  'onSettingsClick',
  'onDebugPanelToggle',
  'onPrintClick',
  'initialTab',
]);
const filterProps = (props: Record<string, unknown>) => {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (typeof value !== 'function' && typeof value !== 'object' && !NON_DOM_PROPS.has(key)) {
      safe[key] = value;
    }
  }
  return safe;
};

/** Lets a mocked store hook answer selector calls from a fixed state. */
function mockStoreState(store: Mock, state: unknown): void {
  store.mockImplementation((selector?: (current: unknown) => unknown) => (selector ? selector(state) : state));
}

/** The session ID the mocked session store reports; set per test. */
let currentSessionId: string | null = null;

function mockSessionStoreState(state: unknown): void {
  vi.mocked(useSessionStoreModule.useSessionStore).mockImplementation(((selector?: (current: unknown) => unknown) => {
    const current = { currentSessionId, ...(state as object) };
    return selector ? selector(current) : current;
  }) as never);
}

const modeSwitchActions = {
  handlePreparationClick: vi.fn(),
  handleMatchClick: vi.fn(),
  handleNextStageClick: vi.fn(),
  progressError: null,
  dismissProgressError: vi.fn(),
};

const setMockWindowChrome = (hasNativeWindowFrame: boolean) => {
  (window.electronAPI as { hasNativeWindowFrame: boolean }).hasNativeWindowFrame = hasNativeWindowFrame;
};

// Mock hooks and stores
vi.mock('@/renderer/presentation/hooks/useShot');
vi.mock('@/renderer/presentation/stores/sessionStore', async () => {
  const actual = await vi.importActual<typeof import('@/renderer/presentation/stores/sessionStore')>(
    '@/renderer/presentation/stores/sessionStore',
  );
  return {
    ...actual,
    useSessionStore: vi.fn(),
  };
});
vi.mock('@/renderer/presentation/stores/connectionStore');

// Mock reportService
vi.mock('@/renderer/services/reportService', () => ({
  reportService: {
    openPrintWindow: vi.fn().mockResolvedValue(undefined),
  },
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

// Mock utilities
// SideMenu mock that captures callback props
let capturedSideMenuProps: Record<string, unknown> = {};
vi.mock('@/renderer/presentation/components/SideMenu', () => ({
  SideMenu: (props: Record<string, unknown>) => {
    capturedSideMenuProps = props;
    return <div data-testid="side-menu" {...filterProps(props)} />;
  },
}));
vi.mock('@/renderer/presentation/components/SidePanel', () => ({
  SidePanel: (props: Record<string, unknown>) => <div data-testid="side-panel" {...filterProps(props)} />,
}));
vi.mock('@/renderer/presentation/components/TargetDisplay', () => ({
  TargetDisplay: ({
    shots,
    discipline,
    zoomMode,
  }: {
    shots: { length: number }[];
    discipline: string;
    zoomMode: string;
  }) => (
    <div data-testid="target-display" data-zoom-mode={zoomMode}>
      {shots.length} shots {discipline}
    </div>
  ),
}));
vi.mock('@/renderer/presentation/components/StatusBar', () => ({
  StatusBar: ({ isConnected }: { isConnected: boolean }) => (
    <div data-testid="status-bar">{isConnected ? 'Connected' : 'Disconnected'}</div>
  ),
}));
vi.mock('@/renderer/presentation/components/DebugPane', () => ({
  DebugPane: (props: Record<string, unknown>) => <div data-testid="debug-pane" {...filterProps(props)} />,
}));
vi.mock('@/renderer/presentation/components/SettingsModal', () => ({
  SettingsModal: ({ isOpen, initialTab }: { isOpen: boolean; initialTab?: string }) =>
    isOpen ? (
      <div data-testid="settings-modal-open" data-initial-tab={initialTab ?? 'general'}>
        SettingsModal
      </div>
    ) : (
      <div data-testid="settings-modal-closed" />
    ),
}));

describe('MainScreen', () => {
  it('shows unverified remaining time on the paused Lane screen', () => {
    useCompetitionStore.setState({
      interruption: {
        interruptionId: 'restart',
        status: 'PAUSED',
        remainingSeconds: 4000,
        unlimitedSightingShots: false,
        remainingTimeVerified: false,
      },
    });
    render(<MainScreen modeSwitchActions={modeSwitchActions} />);
    expect(screen.getByText('Remaining time not verified — check the time before resuming')).toBeVisible();
    act(() =>
      useCompetitionStore.setState({
        interruption: { ...useCompetitionStore.getState().interruption!, status: 'SIGHTING' },
      }),
    );
    expect(screen.queryByText('Remaining time not verified — check the time before resuming')).not.toBeInTheDocument();
    act(() => useCompetitionStore.setState({ interruption: null }));
  });
  // Default mock values
  const defaultMockShot: UseShotResult = {
    shots: [],
    refreshShotHistory: vi.fn(),
  };

  // getState mock for useSessionStore.getState()
  const mockSetDiscipline = vi.fn();
  const mockSetLaneNumber = vi.fn();

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    useConnectionNotificationStore.getState().dismiss();
    capturedSideMenuProps = {};
    setMockWindowChrome(false);
    currentSessionId = null;
    vi.mocked(useShotModule.useShot).mockReturnValue(defaultMockShot);

    // useSessionStore is both a hook (called as function) and has getState()
    const mockUseSessionStore = vi.mocked(useSessionStoreModule.useSessionStore);
    mockSessionStoreState({
      discipline: 'AIR_RIFLE_10M',
      mode: 'SIGHTING',
    } as ReturnType<typeof useSessionStoreModule.useSessionStore>);
    // Attach getState for the useEffect in MainScreen
    (mockUseSessionStore as unknown as { getState: () => unknown }).getState = () => ({
      currentSessionId,
      setDiscipline: mockSetDiscipline,
      setLaneNumber: mockSetLaneNumber,
    });

    mockStoreState(vi.mocked(useConnectionStoreModule.useConnectionStore), {
      status: 'disconnected',
    } as ReturnType<typeof useConnectionStoreModule.useConnectionStore>);
  });

  describe('basic rendering', () => {
    it('renders MainScreen correctly', () => {
      render(<MainScreen modeSwitchActions={modeSwitchActions} />);

      // Main components are displayed
      expect(screen.getByTestId('side-menu')).toBeInTheDocument();
      expect(screen.getByTestId('side-panel')).toBeInTheDocument();
      expect(screen.getByTestId('status-bar')).toBeInTheDocument();
    });

    it('displays SideMenu', () => {
      render(<MainScreen modeSwitchActions={modeSwitchActions} />);

      expect(screen.getByTestId('side-menu')).toBeInTheDocument();
    });

    it('displays SidePanel', () => {
      render(<MainScreen modeSwitchActions={modeSwitchActions} />);

      expect(screen.getByTestId('side-panel')).toBeInTheDocument();
    });

    it('displays StatusBar', () => {
      render(<MainScreen modeSwitchActions={modeSwitchActions} />);

      const statusBar = screen.getByTestId('status-bar');
      expect(statusBar).toBeInTheDocument();
      expect(statusBar).toHaveTextContent('Disconnected');
    });

    it('StatusBar displays connected state when connected', () => {
      mockStoreState(vi.mocked(useConnectionStoreModule.useConnectionStore), {
        status: 'connected',
      } as ReturnType<typeof useConnectionStoreModule.useConnectionStore>);

      render(<MainScreen modeSwitchActions={modeSwitchActions} />);

      const statusBar = screen.getByTestId('status-bar');
      expect(statusBar).toHaveTextContent('Connected');
    });

    it('opens connection settings from the disconnect toast action', () => {
      useConnectionNotificationStore.getState().showUnexpectedDisconnect('USB device disconnected unexpectedly');

      render(<MainScreen modeSwitchActions={modeSwitchActions} />);

      fireEvent.click(screen.getByText('Open Connection Settings'));

      expect(screen.getByTestId('settings-modal-open')).toHaveAttribute('data-initial-tab', 'connection');
    });
  });

  describe('window chrome', () => {
    it('shows custom window controls when the window is frameless', () => {
      setMockWindowChrome(false);

      render(<MainScreen modeSwitchActions={modeSwitchActions} />);

      expect(screen.getByLabelText('Minimize')).toBeInTheDocument();
      expect(screen.getByLabelText('Maximize')).toBeInTheDocument();
      expect(screen.getByLabelText('Close')).toBeInTheDocument();
    });

    it('hides custom window controls when using the native window frame', () => {
      setMockWindowChrome(true);

      render(<MainScreen modeSwitchActions={modeSwitchActions} />);

      expect(screen.queryByLabelText('Minimize')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Maximize')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Close')).not.toBeInTheDocument();
    });
  });

  describe('before session start', () => {
    it('does not display TargetDisplay', () => {
      currentSessionId = null;

      render(<MainScreen modeSwitchActions={modeSwitchActions} />);

      expect(screen.queryByTestId('target-display')).not.toBeInTheDocument();
    });

    it('displays the no session message', () => {
      currentSessionId = null;

      render(<MainScreen modeSwitchActions={modeSwitchActions} />);

      expect(screen.getByText('No session started')).toBeInTheDocument();
      expect(screen.getByText('Please select a discipline from Settings')).toBeInTheDocument();
    });

    it('displays the message when discipline is null', () => {
      currentSessionId = 'session-123';
      mockSessionStoreState({
        discipline: null,
        mode: 'SIGHTING',
      } as ReturnType<typeof useSessionStoreModule.useSessionStore>);

      render(<MainScreen modeSwitchActions={modeSwitchActions} />);

      expect(screen.getByText('No session started')).toBeInTheDocument();
      expect(screen.queryByTestId('target-display')).not.toBeInTheDocument();
    });
  });

  describe('after session start', () => {
    it('displays TargetDisplay', () => {
      currentSessionId = 'session-123';
      mockSessionStoreState({
        discipline: 'AIR_RIFLE_10M',
        mode: 'SIGHTING',
      } as ReturnType<typeof useSessionStoreModule.useSessionStore>);

      render(<MainScreen modeSwitchActions={modeSwitchActions} />);

      expect(screen.getByTestId('target-display')).toBeInTheDocument();
    });

    it('does not display the no session message', () => {
      currentSessionId = 'session-123';
      mockSessionStoreState({
        discipline: 'AIR_RIFLE_10M',
        mode: 'SIGHTING',
      } as ReturnType<typeof useSessionStoreModule.useSessionStore>);

      render(<MainScreen modeSwitchActions={modeSwitchActions} />);

      expect(screen.queryByText('No session started')).not.toBeInTheDocument();
    });

    it('passes shots to TargetDisplay', () => {
      const mockShots: ShotDto[] = [
        {
          id: 'shot-1',
          shotNumber: 1,
          score: 10.5,
          x: 0.5,
          y: 0.3,
          timestamp: new Date().toISOString(),
          mode: 'MATCH',
          isRecorded: true,
          innerTen: false,
        },
      ];

      currentSessionId = 'session-123';
      vi.mocked(useShotModule.useShot).mockReturnValue({
        ...defaultMockShot,
        shots: mockShots,
      });
      mockSessionStoreState({
        discipline: 'AIR_RIFLE_10M',
        mode: 'SIGHTING',
      } as ReturnType<typeof useSessionStoreModule.useSessionStore>);

      render(<MainScreen modeSwitchActions={modeSwitchActions} />);

      const targetDisplay = screen.getByTestId('target-display');
      expect(targetDisplay).toHaveTextContent('1 shots');
    });

    it('passes discipline to TargetDisplay', () => {
      currentSessionId = 'session-123';
      mockSessionStoreState({
        discipline: 'AIR_RIFLE_10M',
        mode: 'SIGHTING',
      } as ReturnType<typeof useSessionStoreModule.useSessionStore>);

      render(<MainScreen modeSwitchActions={modeSwitchActions} />);

      expect(screen.getByText(/AIR_RIFLE_10M/)).toBeInTheDocument();
    });
  });

  describe('custom className', () => {
    it('applies a custom className', () => {
      const { container } = render(<MainScreen className="custom-class" modeSwitchActions={modeSwitchActions} />);

      const mainScreen = container.firstChild as HTMLElement;
      expect(mainScreen).toHaveClass('custom-class');
    });

    it('coexists default classes with custom class', () => {
      const { container } = render(<MainScreen className="custom-class" modeSwitchActions={modeSwitchActions} />);

      const mainScreen = container.firstChild as HTMLElement;
      expect(mainScreen).toHaveClass('custom-class');
      expect(mainScreen).toHaveClass('flex');
      expect(mainScreen).toHaveClass('flex-col');
      expect(mainScreen).toHaveClass('h-screen');
    });
  });

  describe('layout', () => {
    it('has a vertical flex layout', () => {
      const { container } = render(<MainScreen modeSwitchActions={modeSwitchActions} />);

      const mainScreen = container.firstChild as HTMLElement;
      expect(mainScreen).toHaveClass('flex', 'flex-col', 'h-screen');
    });

    it('has a dark mode background color', () => {
      const { container } = render(<MainScreen modeSwitchActions={modeSwitchActions} />);

      const mainScreen = container.firstChild as HTMLElement;
      expect(mainScreen).toHaveClass('bg-zinc-900');
    });

    it('main content area has a horizontal flex layout', () => {
      const { container } = render(<MainScreen modeSwitchActions={modeSwitchActions} />);

      const mainContent = container.querySelector('.flex.flex-1.overflow-hidden');
      expect(mainContent).toBeInTheDocument();
    });

    it('has a main tag', () => {
      const { container } = render(<MainScreen modeSwitchActions={modeSwitchActions} />);

      const mainElement = container.querySelector('main');
      expect(mainElement).toBeInTheDocument();
    });

    it('main tag has flex-1 class', () => {
      const { container } = render(<MainScreen modeSwitchActions={modeSwitchActions} />);

      const mainElement = container.querySelector('main');
      expect(mainElement).toHaveClass('flex-1');
    });
  });

  describe('center content area', () => {
    it('has center-aligned styles', () => {
      const { container } = render(<MainScreen modeSwitchActions={modeSwitchActions} />);

      const centerContent = container.querySelector('main');
      expect(centerContent).toHaveClass('flex', 'flex-col', 'items-center', 'justify-center');
    });

    it('is scrollable on overflow', () => {
      const { container } = render(<MainScreen modeSwitchActions={modeSwitchActions} />);

      const centerContent = container.querySelector('main');
      expect(centerContent).toHaveClass('overflow-auto');
    });

    it('has a dark mode background color', () => {
      const { container } = render(<MainScreen modeSwitchActions={modeSwitchActions} />);

      const centerContent = container.querySelector('main');
      expect(centerContent).toHaveClass('bg-zinc-900');
    });
  });

  describe('complex states', () => {
    it('displays correctly right after session start (no shots)', () => {
      currentSessionId = 'session-123';
      vi.mocked(useShotModule.useShot).mockReturnValue({
        ...defaultMockShot,
        shots: [],
      });
      mockSessionStoreState({
        discipline: 'AIR_RIFLE_10M',
        mode: 'SIGHTING',
      } as ReturnType<typeof useSessionStoreModule.useSessionStore>);

      render(<MainScreen modeSwitchActions={modeSwitchActions} />);

      expect(screen.getByTestId('target-display')).toBeInTheDocument();
      expect(screen.getByText(/0 shots/)).toBeInTheDocument();
    });

    it('displays correctly with many shots', () => {
      const mockShots: ShotDto[] = Array.from({ length: 60 }, (_, i) => ({
        id: `shot-${i + 1}`,
        shotNumber: i + 1,
        score: 10.0,
        x: 0,
        y: 0,
        timestamp: new Date().toISOString(),
        mode: 'MATCH',
        isRecorded: true,
        innerTen: false,
      }));

      currentSessionId = 'session-123';
      vi.mocked(useShotModule.useShot).mockReturnValue({
        ...defaultMockShot,
        shots: mockShots,
      });
      mockSessionStoreState({
        discipline: 'AIR_RIFLE_10M',
        mode: 'MATCH',
      } as ReturnType<typeof useSessionStoreModule.useSessionStore>);

      render(<MainScreen modeSwitchActions={modeSwitchActions} />);

      expect(screen.getByText(/60 shots/)).toBeInTheDocument();
    });

    it('displays correctly with mixed sighting and match shots', () => {
      const mockShots: ShotDto[] = [
        {
          id: 'shot-1',
          shotNumber: 1,
          score: 10.5,
          x: 0.5,
          y: 0.3,
          timestamp: new Date().toISOString(),
          mode: 'SIGHTING',
          isRecorded: false, // sighting
          innerTen: false,
        },
        {
          id: 'shot-2',
          shotNumber: 2,
          score: 9.8,
          x: 0.2,
          y: 0.1,
          timestamp: new Date().toISOString(),
          mode: 'SIGHTING',
          isRecorded: false, // sighting
          innerTen: false,
        },
        {
          id: 'shot-3',
          shotNumber: 3,
          score: 10.2,
          x: 0.1,
          y: 0.2,
          timestamp: new Date().toISOString(),
          mode: 'MATCH',
          isRecorded: true, // match
          innerTen: false,
        },
      ];

      currentSessionId = 'session-123';
      vi.mocked(useShotModule.useShot).mockReturnValue({
        ...defaultMockShot,
        shots: mockShots,
      });
      mockSessionStoreState({
        discipline: 'AIR_RIFLE_10M',
        mode: 'MATCH',
      } as ReturnType<typeof useSessionStoreModule.useSessionStore>);

      render(<MainScreen modeSwitchActions={modeSwitchActions} />);

      // All shots (including sighting) are displayed
      expect(screen.getByText(/3 shots/)).toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('can render with mode switch actions', () => {
      expect(() => {
        render(<MainScreen modeSwitchActions={modeSwitchActions} />);
      }).not.toThrow();
    });

    it('does not error without a session', () => {
      currentSessionId = null;

      expect(() => {
        render(<MainScreen modeSwitchActions={modeSwitchActions} />);
      }).not.toThrow();
    });

    it('does not error when useShot returns an empty array', () => {
      vi.mocked(useShotModule.useShot).mockReturnValue({
        ...defaultMockShot,
        shots: [],
      });

      expect(() => {
        render(<MainScreen modeSwitchActions={modeSwitchActions} />);
      }).not.toThrow();
    });

    it('works correctly with multiple re-renders', () => {
      const { rerender } = render(<MainScreen modeSwitchActions={modeSwitchActions} />);

      rerender(<MainScreen modeSwitchActions={modeSwitchActions} />);
      rerender(<MainScreen modeSwitchActions={modeSwitchActions} />);

      expect(screen.getByTestId('side-menu')).toBeInTheDocument();
      expect(screen.getByTestId('side-panel')).toBeInTheDocument();
      expect(screen.getByTestId('status-bar')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('uses the main tag appropriately', () => {
      const { container } = render(<MainScreen modeSwitchActions={modeSwitchActions} />);

      const mainElement = container.querySelector('main');
      expect(mainElement).toBeInTheDocument();
    });

    it('no session message is readable', () => {
      currentSessionId = null;

      render(<MainScreen modeSwitchActions={modeSwitchActions} />);

      const message = screen.getByText('No session started');
      expect(message).toHaveClass('text-lg');
    });
  });

  describe('keyboard shortcuts', () => {
    it('NumpadDecimal opens SettingsModal', () => {
      render(<MainScreen modeSwitchActions={modeSwitchActions} />);

      // Initially closed
      expect(screen.getByTestId('settings-modal-closed')).toBeInTheDocument();
      expect(screen.queryByTestId('settings-modal-open')).not.toBeInTheDocument();

      // Press NumpadDecimal
      act(() => {
        fireEvent.keyDown(window, { code: 'NumpadDecimal' });
      });

      // Now open
      expect(screen.getByTestId('settings-modal-open')).toBeInTheDocument();
    });

    it('initialTab is general when opened via NumpadDecimal', () => {
      render(<MainScreen modeSwitchActions={modeSwitchActions} />);

      act(() => {
        fireEvent.keyDown(window, { code: 'NumpadDecimal' });
      });

      const modal = screen.getByTestId('settings-modal-open');
      expect(modal).toHaveAttribute('data-initial-tab', 'general');
    });

    it('pressing NumpadDecimal again closes the modal', () => {
      render(<MainScreen modeSwitchActions={modeSwitchActions} />);

      // Open
      act(() => {
        fireEvent.keyDown(window, { code: 'NumpadDecimal' });
      });
      expect(screen.getByTestId('settings-modal-open')).toBeInTheDocument();

      // Close by pressing again
      act(() => {
        fireEvent.keyDown(window, { code: 'NumpadDecimal' });
      });
      expect(screen.getByTestId('settings-modal-closed')).toBeInTheDocument();
      expect(screen.queryByTestId('settings-modal-open')).not.toBeInTheDocument();
    });

    it('ESC closes SettingsModal', () => {
      render(<MainScreen modeSwitchActions={modeSwitchActions} />);

      // Open modal first with NumpadDecimal
      act(() => {
        fireEvent.keyDown(window, { code: 'NumpadDecimal' });
      });
      expect(screen.getByTestId('settings-modal-open')).toBeInTheDocument();

      // Press ESC
      act(() => {
        fireEvent.keyDown(window, { key: 'Escape' });
      });

      // Now closed
      expect(screen.getByTestId('settings-modal-closed')).toBeInTheDocument();
      expect(screen.queryByTestId('settings-modal-open')).not.toBeInTheDocument();
    });

    it('does not auto-hide the cursor while SettingsModal is open', () => {
      vi.useFakeTimers();

      try {
        render(<MainScreen modeSwitchActions={modeSwitchActions} />);

        act(() => {
          fireEvent.keyDown(window, { code: 'NumpadDecimal' });
        });

        expect(screen.getByTestId('settings-modal-open')).toBeInTheDocument();

        act(() => {
          vi.advanceTimersByTime(5000);
        });

        expect(document.documentElement).not.toHaveClass('cursor-hidden');
      } finally {
        vi.runOnlyPendingTimers();
        vi.useRealTimers();
        document.documentElement.classList.remove('cursor-hidden');
      }
    });
  });

  describe('progress command failures', () => {
    it('shows the failed command message until it is dismissed', () => {
      const dismissProgressError = vi.fn();
      const { rerender } = render(
        <MainScreen
          modeSwitchActions={{
            ...modeSwitchActions,
            progressError: 'Restore or finish the saved run before starting again.',
            dismissProgressError,
          }}
        />,
      );

      expect(screen.getByRole('alert')).toHaveTextContent('Restore or finish the saved run before starting again.');
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
      expect(dismissProgressError).toHaveBeenCalledOnce();

      rerender(<MainScreen modeSwitchActions={modeSwitchActions} />);
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('View menu zoom', () => {
    it('steps Zoom In and Zoom Out through the zoom modes in opposite directions', () => {
      currentSessionId = 'session-123';
      render(<MainScreen modeSwitchActions={modeSwitchActions} />);
      const chooseFromViewMenu = (label: string) => {
        fireEvent.click(screen.getByRole('menuitem', { name: 'View' }));
        fireEvent.click(screen.getByRole('menuitem', { name: label }));
      };

      expect(screen.getByTestId('target-display')).toHaveAttribute('data-zoom-mode', 'AUTO');
      chooseFromViewMenu('Zoom In');
      expect(screen.getByTestId('target-display')).toHaveAttribute('data-zoom-mode', 'FULL');
      chooseFromViewMenu('Zoom In');
      expect(screen.getByTestId('target-display')).toHaveAttribute('data-zoom-mode', 'RING_4');
      chooseFromViewMenu('Zoom Out');
      expect(screen.getByTestId('target-display')).toHaveAttribute('data-zoom-mode', 'FULL');
      chooseFromViewMenu('Zoom Out');
      expect(screen.getByTestId('target-display')).toHaveAttribute('data-zoom-mode', 'AUTO');
      chooseFromViewMenu('Zoom Out');
      expect(screen.getByTestId('target-display')).toHaveAttribute('data-zoom-mode', 'RING_8');
    });
  });

  describe('SideMenu callbacks', () => {
    it('passes the shared mode switch actions to SideMenu', () => {
      render(<MainScreen modeSwitchActions={modeSwitchActions} />);

      expect(capturedSideMenuProps.onPreparationClick).toBe(modeSwitchActions.handlePreparationClick);
      expect(capturedSideMenuProps.onMatchClick).toBe(modeSwitchActions.handleMatchClick);
      expect(capturedSideMenuProps.onNextStageClick).toBe(modeSwitchActions.handleNextStageClick);
    });

    it('onSettingsClick opens Settings with the general tab', () => {
      render(<MainScreen modeSwitchActions={modeSwitchActions} />);

      const onSettingsClick = capturedSideMenuProps.onSettingsClick as () => void;
      act(() => {
        onSettingsClick();
      });

      const modal = screen.getByTestId('settings-modal-open');
      expect(modal).toHaveAttribute('data-initial-tab', 'general');
    });
  });

  describe('state transitions', () => {
    it('correctly transitions from no session to session started', () => {
      // Initial: no session
      const { rerender } = render(<MainScreen modeSwitchActions={modeSwitchActions} />);
      expect(screen.getByText('No session started')).toBeInTheDocument();
      expect(screen.queryByTestId('target-display')).not.toBeInTheDocument();

      // Session started
      currentSessionId = 'session-123';
      mockSessionStoreState({
        discipline: 'AIR_RIFLE_10M',
        mode: 'SIGHTING',
      } as ReturnType<typeof useSessionStoreModule.useSessionStore>);
      rerender(<MainScreen modeSwitchActions={modeSwitchActions} />);

      expect(screen.queryByText('No session started')).not.toBeInTheDocument();
      expect(screen.getByTestId('target-display')).toBeInTheDocument();
    });

    it('updates the display when shot count increases', () => {
      currentSessionId = 'session-123';
      mockSessionStoreState({
        discipline: 'AIR_RIFLE_10M',
        mode: 'SIGHTING',
      } as ReturnType<typeof useSessionStoreModule.useSessionStore>);

      // Initial: no shots
      const { rerender } = render(<MainScreen modeSwitchActions={modeSwitchActions} />);
      let targetDisplay = screen.getByTestId('target-display');
      expect(targetDisplay).toHaveTextContent('0 shots');

      // Add shots
      const mockShots: ShotDto[] = [
        {
          id: 'shot-1',
          shotNumber: 1,
          score: 10.5,
          x: 0.5,
          y: 0.3,
          timestamp: new Date().toISOString(),
          mode: 'MATCH',
          isRecorded: true,
          innerTen: false,
        },
      ];
      vi.mocked(useShotModule.useShot).mockReturnValue({
        ...defaultMockShot,
        shots: mockShots,
      });
      rerender(<MainScreen modeSwitchActions={modeSwitchActions} />);

      targetDisplay = screen.getByTestId('target-display');
      expect(targetDisplay).toHaveTextContent('1 shots');
    });
  });
});
