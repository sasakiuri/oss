// SPDX-License-Identifier: MIT
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UseSessionResult } from '@/renderer/presentation/hooks/useSession';
import * as useSessionModule from '@/renderer/presentation/hooks/useSession';
import type { UseShotResult } from '@/renderer/presentation/hooks/useShot';
import * as useShotModule from '@/renderer/presentation/hooks/useShot';
import { MainScreen } from '@/renderer/presentation/screens/MainScreen';
import * as useConnectionStoreModule from '@/renderer/presentation/stores/connectionStore';
import * as useSessionStoreModule from '@/renderer/presentation/stores/sessionStore';
import type { ShotDto } from '@/shared/ipc/contracts';

// Mock useTitleBar to prevent async state updates from windowService.getWindowState()
vi.mock('@/renderer/presentation/hooks/useTitleBar', () => ({
  useTitleBar: () => ({
    isMaximized: false,
    handleMinimize: vi.fn(),
    handleMaximize: vi.fn(),
    handleClose: vi.fn(),
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

// Mock hooks and stores
vi.mock('@/renderer/presentation/hooks/useSession');
vi.mock('@/renderer/presentation/hooks/useShot');
vi.mock('@/renderer/presentation/hooks/useModeSwitchActions', () => ({
  useModeSwitchActions: () => ({
    handlePreparationClick: vi.fn(),
    handleMatchClick: vi.fn(),
    handleNextStageClick: vi.fn(),
  }),
}));
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
vi.mock('@/renderer/presentation/utils/zoomCalculator', () => ({
  getNextZoomMode: vi.fn((current: string) => {
    const modes = ['AUTO', 'RING_8', 'RING_6', 'RING_4', 'FULL'] as const;
    const index = modes.indexOf(current as (typeof modes)[number]);
    return modes[(index + 1) % modes.length];
  }),
  getPrevZoomMode: vi.fn((current: string) => {
    const modes = ['AUTO', 'RING_8', 'RING_6', 'RING_4', 'FULL'] as const;
    const index = modes.indexOf(current as (typeof modes)[number]);
    return modes[(index - 1 + modes.length) % modes.length];
  }),
}));

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
  TargetDisplay: ({ shots, discipline }: { shots: { length: number }[]; discipline: string }) => (
    <div data-testid="target-display">
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
  // Default mock values
  const defaultMockSession: UseSessionResult = {
    currentSessionId: null,
    mode: 'SIGHTING',
    totalScore: 0,
    seriesScores: [],
    startSession: vi.fn(),
    switchMode: vi.fn(),
    resetSession: vi.fn(),
    isStarting: false,
    isSwitching: false,
    isResetting: false,
    error: null,
  };

  const defaultMockShot: UseShotResult = {
    shots: [],
    latestShot: null,
    refreshShotHistory: vi.fn(),
    isLoading: false,
  };

  // getState mock for useSessionStore.getState()
  const mockSetDiscipline = vi.fn();
  const mockSetLaneNumber = vi.fn();

  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
    capturedSideMenuProps = {};
    vi.mocked(useSessionModule.useSession).mockReturnValue(defaultMockSession);
    vi.mocked(useShotModule.useShot).mockReturnValue(defaultMockShot);

    // useSessionStore is both a hook (called as function) and has getState()
    const mockUseSessionStore = vi.mocked(useSessionStoreModule.useSessionStore);
    mockUseSessionStore.mockReturnValue({
      discipline: 'AIR_RIFLE_10M',
      mode: 'SIGHTING',
    } as ReturnType<typeof useSessionStoreModule.useSessionStore>);
    // Attach getState for the useEffect in MainScreen
    (mockUseSessionStore as unknown as { getState: () => unknown }).getState = () => ({
      setDiscipline: mockSetDiscipline,
      setLaneNumber: mockSetLaneNumber,
    });

    vi.mocked(useConnectionStoreModule.useConnectionStore).mockReturnValue({
      status: 'disconnected',
    } as ReturnType<typeof useConnectionStoreModule.useConnectionStore>);
  });

  describe('basic rendering', () => {
    it('renders MainScreen correctly', () => {
      render(<MainScreen />);

      // Main components are displayed
      expect(screen.getByTestId('side-menu')).toBeInTheDocument();
      expect(screen.getByTestId('side-panel')).toBeInTheDocument();
      expect(screen.getByTestId('status-bar')).toBeInTheDocument();
    });

    it('displays SideMenu', () => {
      render(<MainScreen />);

      expect(screen.getByTestId('side-menu')).toBeInTheDocument();
    });

    it('displays SidePanel', () => {
      render(<MainScreen />);

      expect(screen.getByTestId('side-panel')).toBeInTheDocument();
    });

    it('displays StatusBar', () => {
      render(<MainScreen />);

      const statusBar = screen.getByTestId('status-bar');
      expect(statusBar).toBeInTheDocument();
      expect(statusBar).toHaveTextContent('Disconnected');
    });

    it('StatusBar displays connected state when connected', () => {
      vi.mocked(useConnectionStoreModule.useConnectionStore).mockReturnValue({
        status: 'connected',
      } as ReturnType<typeof useConnectionStoreModule.useConnectionStore>);

      render(<MainScreen />);

      const statusBar = screen.getByTestId('status-bar');
      expect(statusBar).toHaveTextContent('Connected');
    });
  });

  describe('before session start', () => {
    it('does not display TargetDisplay', () => {
      vi.mocked(useSessionModule.useSession).mockReturnValue({
        ...defaultMockSession,
        currentSessionId: null,
      });

      render(<MainScreen />);

      expect(screen.queryByTestId('target-display')).not.toBeInTheDocument();
    });

    it('displays the no session message', () => {
      vi.mocked(useSessionModule.useSession).mockReturnValue({
        ...defaultMockSession,
        currentSessionId: null,
      });

      render(<MainScreen />);

      expect(screen.getByText('No session started')).toBeInTheDocument();
      expect(screen.getByText('Please select a discipline from Settings')).toBeInTheDocument();
    });

    it('displays the message when discipline is null', () => {
      vi.mocked(useSessionModule.useSession).mockReturnValue({
        ...defaultMockSession,
        currentSessionId: 'session-123',
      });
      vi.mocked(useSessionStoreModule.useSessionStore).mockReturnValue({
        discipline: null,
        mode: 'SIGHTING',
      } as ReturnType<typeof useSessionStoreModule.useSessionStore>);

      render(<MainScreen />);

      expect(screen.getByText('No session started')).toBeInTheDocument();
      expect(screen.queryByTestId('target-display')).not.toBeInTheDocument();
    });
  });

  describe('after session start', () => {
    it('displays TargetDisplay', () => {
      vi.mocked(useSessionModule.useSession).mockReturnValue({
        ...defaultMockSession,
        currentSessionId: 'session-123',
      });
      vi.mocked(useSessionStoreModule.useSessionStore).mockReturnValue({
        discipline: 'AIR_RIFLE_10M',
        mode: 'SIGHTING',
      } as ReturnType<typeof useSessionStoreModule.useSessionStore>);

      render(<MainScreen />);

      expect(screen.getByTestId('target-display')).toBeInTheDocument();
    });

    it('does not display the no session message', () => {
      vi.mocked(useSessionModule.useSession).mockReturnValue({
        ...defaultMockSession,
        currentSessionId: 'session-123',
      });
      vi.mocked(useSessionStoreModule.useSessionStore).mockReturnValue({
        discipline: 'AIR_RIFLE_10M',
        mode: 'SIGHTING',
      } as ReturnType<typeof useSessionStoreModule.useSessionStore>);

      render(<MainScreen />);

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

      vi.mocked(useSessionModule.useSession).mockReturnValue({
        ...defaultMockSession,
        currentSessionId: 'session-123',
      });
      vi.mocked(useShotModule.useShot).mockReturnValue({
        ...defaultMockShot,
        shots: mockShots,
      });
      vi.mocked(useSessionStoreModule.useSessionStore).mockReturnValue({
        discipline: 'AIR_RIFLE_10M',
        mode: 'SIGHTING',
      } as ReturnType<typeof useSessionStoreModule.useSessionStore>);

      render(<MainScreen />);

      const targetDisplay = screen.getByTestId('target-display');
      expect(targetDisplay).toHaveTextContent('1 shots');
    });

    it('passes discipline to TargetDisplay', () => {
      vi.mocked(useSessionModule.useSession).mockReturnValue({
        ...defaultMockSession,
        currentSessionId: 'session-123',
      });
      vi.mocked(useSessionStoreModule.useSessionStore).mockReturnValue({
        discipline: 'AIR_RIFLE_10M',
        mode: 'SIGHTING',
      } as ReturnType<typeof useSessionStoreModule.useSessionStore>);

      render(<MainScreen />);

      expect(screen.getByText(/AIR_RIFLE_10M/)).toBeInTheDocument();
    });
  });

  describe('custom className', () => {
    it('applies a custom className', () => {
      const { container } = render(<MainScreen className="custom-class" />);

      const mainScreen = container.firstChild as HTMLElement;
      expect(mainScreen).toHaveClass('custom-class');
    });

    it('coexists default classes with custom class', () => {
      const { container } = render(<MainScreen className="custom-class" />);

      const mainScreen = container.firstChild as HTMLElement;
      expect(mainScreen).toHaveClass('custom-class');
      expect(mainScreen).toHaveClass('flex');
      expect(mainScreen).toHaveClass('flex-col');
      expect(mainScreen).toHaveClass('h-screen');
    });
  });

  describe('layout', () => {
    it('has a vertical flex layout', () => {
      const { container } = render(<MainScreen />);

      const mainScreen = container.firstChild as HTMLElement;
      expect(mainScreen).toHaveClass('flex', 'flex-col', 'h-screen');
    });

    it('has a dark mode background color', () => {
      const { container } = render(<MainScreen />);

      const mainScreen = container.firstChild as HTMLElement;
      expect(mainScreen).toHaveClass('bg-zinc-900');
    });

    it('main content area has a horizontal flex layout', () => {
      const { container } = render(<MainScreen />);

      const mainContent = container.querySelector('.flex.flex-1.overflow-hidden');
      expect(mainContent).toBeInTheDocument();
    });

    it('has a main tag', () => {
      const { container } = render(<MainScreen />);

      const mainElement = container.querySelector('main');
      expect(mainElement).toBeInTheDocument();
    });

    it('main tag has flex-1 class', () => {
      const { container } = render(<MainScreen />);

      const mainElement = container.querySelector('main');
      expect(mainElement).toHaveClass('flex-1');
    });
  });

  describe('center content area', () => {
    it('has center-aligned styles', () => {
      const { container } = render(<MainScreen />);

      const centerContent = container.querySelector('main');
      expect(centerContent).toHaveClass('flex', 'flex-col', 'items-center', 'justify-center');
    });

    it('is scrollable on overflow', () => {
      const { container } = render(<MainScreen />);

      const centerContent = container.querySelector('main');
      expect(centerContent).toHaveClass('overflow-auto');
    });

    it('has a dark mode background color', () => {
      const { container } = render(<MainScreen />);

      const centerContent = container.querySelector('main');
      expect(centerContent).toHaveClass('bg-zinc-900');
    });
  });

  describe('complex states', () => {
    it('displays correctly right after session start (no shots)', () => {
      vi.mocked(useSessionModule.useSession).mockReturnValue({
        ...defaultMockSession,
        currentSessionId: 'session-123',
        totalScore: 0,
        seriesScores: [],
      });
      vi.mocked(useShotModule.useShot).mockReturnValue({
        ...defaultMockShot,
        shots: [],
      });
      vi.mocked(useSessionStoreModule.useSessionStore).mockReturnValue({
        discipline: 'AIR_RIFLE_10M',
        mode: 'SIGHTING',
      } as ReturnType<typeof useSessionStoreModule.useSessionStore>);

      render(<MainScreen />);

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

      vi.mocked(useSessionModule.useSession).mockReturnValue({
        ...defaultMockSession,
        currentSessionId: 'session-123',
        totalScore: 600,
        seriesScores: [100, 100, 100, 100, 100, 100],
      });
      vi.mocked(useShotModule.useShot).mockReturnValue({
        ...defaultMockShot,
        shots: mockShots,
      });
      vi.mocked(useSessionStoreModule.useSessionStore).mockReturnValue({
        discipline: 'AIR_RIFLE_10M',
        mode: 'MATCH',
      } as ReturnType<typeof useSessionStoreModule.useSessionStore>);

      render(<MainScreen />);

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

      vi.mocked(useSessionModule.useSession).mockReturnValue({
        ...defaultMockSession,
        currentSessionId: 'session-123',
        totalScore: 10.2,
        seriesScores: [10.2],
      });
      vi.mocked(useShotModule.useShot).mockReturnValue({
        ...defaultMockShot,
        shots: mockShots,
      });
      vi.mocked(useSessionStoreModule.useSessionStore).mockReturnValue({
        discipline: 'AIR_RIFLE_10M',
        mode: 'MATCH',
      } as ReturnType<typeof useSessionStoreModule.useSessionStore>);

      render(<MainScreen />);

      // All shots (including sighting) are displayed
      expect(screen.getByText(/3 shots/)).toBeInTheDocument();
    });
  });

  describe('edge cases', () => {
    it('can render without props', () => {
      expect(() => {
        render(<MainScreen />);
      }).not.toThrow();
    });

    it('does not error when useSession returns null', () => {
      vi.mocked(useSessionModule.useSession).mockReturnValue({
        ...defaultMockSession,
        currentSessionId: null,
        totalScore: 0,
        seriesScores: [],
      });

      expect(() => {
        render(<MainScreen />);
      }).not.toThrow();
    });

    it('does not error when useShot returns an empty array', () => {
      vi.mocked(useShotModule.useShot).mockReturnValue({
        ...defaultMockShot,
        shots: [],
      });

      expect(() => {
        render(<MainScreen />);
      }).not.toThrow();
    });

    it('works correctly with multiple re-renders', () => {
      const { rerender } = render(<MainScreen />);

      rerender(<MainScreen />);
      rerender(<MainScreen />);

      expect(screen.getByTestId('side-menu')).toBeInTheDocument();
      expect(screen.getByTestId('side-panel')).toBeInTheDocument();
      expect(screen.getByTestId('status-bar')).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('uses the main tag appropriately', () => {
      const { container } = render(<MainScreen />);

      const mainElement = container.querySelector('main');
      expect(mainElement).toBeInTheDocument();
    });

    it('no session message is readable', () => {
      vi.mocked(useSessionModule.useSession).mockReturnValue({
        ...defaultMockSession,
        currentSessionId: null,
      });

      render(<MainScreen />);

      const message = screen.getByText('No session started');
      expect(message).toHaveClass('text-lg');
    });
  });

  describe('keyboard shortcuts', () => {
    it('NumpadDecimal opens SettingsModal', () => {
      render(<MainScreen />);

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
      render(<MainScreen />);

      act(() => {
        fireEvent.keyDown(window, { code: 'NumpadDecimal' });
      });

      const modal = screen.getByTestId('settings-modal-open');
      expect(modal).toHaveAttribute('data-initial-tab', 'general');
    });

    it('pressing NumpadDecimal again closes the modal', () => {
      render(<MainScreen />);

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
      render(<MainScreen />);

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
  });

  describe('SideMenu callbacks', () => {
    it('onSettingsClick opens Settings with the general tab', () => {
      render(<MainScreen />);

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
      const { rerender } = render(<MainScreen />);
      expect(screen.getByText('No session started')).toBeInTheDocument();
      expect(screen.queryByTestId('target-display')).not.toBeInTheDocument();

      // Session started
      vi.mocked(useSessionModule.useSession).mockReturnValue({
        ...defaultMockSession,
        currentSessionId: 'session-123',
      });
      vi.mocked(useSessionStoreModule.useSessionStore).mockReturnValue({
        discipline: 'AIR_RIFLE_10M',
        mode: 'SIGHTING',
      } as ReturnType<typeof useSessionStoreModule.useSessionStore>);
      rerender(<MainScreen />);

      expect(screen.queryByText('No session started')).not.toBeInTheDocument();
      expect(screen.getByTestId('target-display')).toBeInTheDocument();
    });

    it('updates the display when shot count increases', () => {
      vi.mocked(useSessionModule.useSession).mockReturnValue({
        ...defaultMockSession,
        currentSessionId: 'session-123',
      });
      vi.mocked(useSessionStoreModule.useSessionStore).mockReturnValue({
        discipline: 'AIR_RIFLE_10M',
        mode: 'SIGHTING',
      } as ReturnType<typeof useSessionStoreModule.useSessionStore>);

      // Initial: no shots
      const { rerender } = render(<MainScreen />);
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
      rerender(<MainScreen />);

      targetDisplay = screen.getByTestId('target-display');
      expect(targetDisplay).toHaveTextContent('1 shots');
    });
  });
});
