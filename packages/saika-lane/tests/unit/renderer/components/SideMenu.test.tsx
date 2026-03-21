// SPDX-License-Identifier: MIT
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SideMenu, type SideMenuProps } from '@/renderer/presentation/components/SideMenu';

// ---------- competitionStore mock ----------

let mockPhase = 'IDLE';
let mockScored = false;
let mockCompetitionId: string | null = null;

vi.mock('@/renderer/presentation/stores/competitionStore', () => ({
  useCompetitionStore: (selector: (s: { phase: string; scored: boolean; competitionId: string | null }) => unknown) =>
    selector({ phase: mockPhase, scored: mockScored, competitionId: mockCompetitionId }),
}));

// ---------- helpers ----------

function defaultProps(overrides: Partial<SideMenuProps> = {}): SideMenuProps {
  return {
    onZoomClick: vi.fn(),
    onPreparationClick: vi.fn(),
    onMatchClick: vi.fn(),
    onNextStageClick: vi.fn(),
    onSettingsClick: vi.fn(),
    ...overrides,
  };
}

// ---------- tests ----------

describe('SideMenu', () => {
  beforeEach(() => {
    mockPhase = 'IDLE';
    mockScored = false;
    mockCompetitionId = null;
  });

  describe('basic rendering', () => {
    it('renders 6 buttons (Zoom, Preparation, Match, Next Stage, Print, Settings)', () => {
      render(<SideMenu {...defaultProps()} />);

      expect(screen.getByRole('button', { name: 'Zoom' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Preparation' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Match' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Next Stage' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Print' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
    });

    it('has a navigation role', () => {
      render(<SideMenu {...defaultProps()} />);

      expect(screen.getByRole('navigation', { name: 'Side Menu' })).toBeInTheDocument();
    });

    it('applies className', () => {
      const { container } = render(<SideMenu {...defaultProps({ className: 'extra' })} />);

      expect(container.firstChild).toHaveClass('extra');
    });
  });

  describe('button clicks', () => {
    it('calls onZoomClick when Zoom button is clicked', async () => {
      const user = userEvent.setup();
      const onZoomClick = vi.fn();
      render(<SideMenu {...defaultProps({ onZoomClick })} />);

      await user.click(screen.getByRole('button', { name: 'Zoom' }));

      expect(onZoomClick).toHaveBeenCalledTimes(1);
    });

    it('calls onPreparationClick when Preparation button is clicked', async () => {
      const user = userEvent.setup();
      const onPreparationClick = vi.fn();
      render(<SideMenu {...defaultProps({ onPreparationClick })} />);

      await user.click(screen.getByRole('button', { name: 'Preparation' }));

      expect(onPreparationClick).toHaveBeenCalledTimes(1);
    });

    it('calls onMatchClick when Match button is clicked (during SERIES_COMPLETE)', async () => {
      mockCompetitionId = 'comp-1';
      mockPhase = 'SERIES_COMPLETE';
      const user = userEvent.setup();
      const onMatchClick = vi.fn();
      render(<SideMenu {...defaultProps({ onMatchClick })} />);

      await user.click(screen.getByRole('button', { name: 'Match' }));

      expect(onMatchClick).toHaveBeenCalledTimes(1);
    });

    it('calls onSettingsClick when Settings button is clicked', async () => {
      const user = userEvent.setup();
      const onSettingsClick = vi.fn();
      render(<SideMenu {...defaultProps({ onSettingsClick })} />);

      await user.click(screen.getByRole('button', { name: 'Settings' }));

      expect(onSettingsClick).toHaveBeenCalledTimes(1);
    });

    it('calls onPrintClick when Print button is clicked', async () => {
      const user = userEvent.setup();
      const onPrintClick = vi.fn();
      render(<SideMenu {...defaultProps({ onPrintClick })} />);

      await user.click(screen.getByRole('button', { name: 'Print' }));

      expect(onPrintClick).toHaveBeenCalledTimes(1);
    });

    it('calls onNextStageClick when Next Stage button is clicked (during ACTIVE+!scored)', async () => {
      mockCompetitionId = 'comp-1';
      mockPhase = 'ACTIVE';
      mockScored = false;
      const user = userEvent.setup();
      const onNextStageClick = vi.fn();
      render(<SideMenu {...defaultProps({ onNextStageClick })} />);

      await user.click(screen.getByRole('button', { name: 'End Preparation' }));

      expect(onNextStageClick).toHaveBeenCalledTimes(1);
    });
  });

  describe('legacy mode (no competitionId)', () => {
    beforeEach(() => {
      mockCompetitionId = null;
    });

    it('Preparation and Match are always enabled', () => {
      render(<SideMenu {...defaultProps()} />);

      expect(screen.getByRole('button', { name: 'Preparation' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Match' })).toBeEnabled();
    });

    it('Next Stage is always disabled', () => {
      render(<SideMenu {...defaultProps()} />);

      expect(screen.getByRole('button', { name: 'Next Stage' })).toBeDisabled();
    });

    it('Preparation/Match do not become active', () => {
      mockPhase = 'ACTIVE';
      mockScored = false;
      render(<SideMenu {...defaultProps()} />);

      expect(screen.getByRole('button', { name: 'Preparation' })).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByRole('button', { name: 'Match' })).toHaveAttribute('aria-pressed', 'false');
    });
  });

  describe('competition mode disable logic', () => {
    beforeEach(() => {
      mockCompetitionId = 'comp-1';
    });

    it('IDLE: Preparation enabled, Match disabled, NextStage disabled', () => {
      mockPhase = 'IDLE';
      render(<SideMenu {...defaultProps()} />);

      expect(screen.getByRole('button', { name: 'Preparation' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Match' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Next Stage' })).toBeDisabled();
    });

    it('ACTIVE+!scored: Preparation enabled, Match enabled, NextStage enabled', () => {
      mockPhase = 'ACTIVE';
      mockScored = false;
      render(<SideMenu {...defaultProps()} />);

      expect(screen.getByRole('button', { name: 'Preparation' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Match' })).toBeEnabled();
      // Next Stage tooltip changes to End Preparation
      expect(screen.getByRole('button', { name: 'End Preparation' })).toBeEnabled();
    });

    it('ACTIVE+scored: Preparation enabled, Match disabled, NextStage disabled', () => {
      mockPhase = 'ACTIVE';
      mockScored = true;
      render(<SideMenu {...defaultProps()} />);

      expect(screen.getByRole('button', { name: 'Preparation' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Match' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Next Stage' })).toBeDisabled();
    });

    it('SERIES_COMPLETE: all buttons enabled', () => {
      mockPhase = 'SERIES_COMPLETE';
      render(<SideMenu {...defaultProps()} />);

      expect(screen.getByRole('button', { name: 'Preparation' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Match' })).toBeEnabled();
      // Next Stage tooltip changes to Advance
      expect(screen.getByRole('button', { name: 'Advance' })).toBeEnabled();
    });

    it('SERIES_ENTERED: Preparation enabled, Match enabled, NextStage disabled', () => {
      mockPhase = 'SERIES_ENTERED';
      render(<SideMenu {...defaultProps()} />);

      expect(screen.getByRole('button', { name: 'Preparation' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Match' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Next Stage' })).toBeDisabled();
    });

    it('STAGE_ENTERED: Preparation enabled, Match enabled, NextStage disabled', () => {
      mockPhase = 'STAGE_ENTERED';
      render(<SideMenu {...defaultProps()} />);

      expect(screen.getByRole('button', { name: 'Preparation' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Match' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Next Stage' })).toBeDisabled();
    });

    it('FINISHED: all buttons disabled', () => {
      mockPhase = 'FINISHED';
      render(<SideMenu {...defaultProps()} />);

      expect(screen.getByRole('button', { name: 'Preparation' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Match' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Next Stage' })).toBeDisabled();
    });

    it('Zoom/Settings are enabled even during FINISHED', () => {
      mockPhase = 'FINISHED';
      render(<SideMenu {...defaultProps()} />);

      expect(screen.getByRole('button', { name: 'Zoom' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Settings' })).toBeEnabled();
    });
  });

  describe('active state display', () => {
    beforeEach(() => {
      mockCompetitionId = 'comp-1';
    });

    it('Preparation has aria-pressed=true during ACTIVE+!scored', () => {
      mockPhase = 'ACTIVE';
      mockScored = false;
      render(<SideMenu {...defaultProps()} />);

      expect(screen.getByRole('button', { name: 'Preparation' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: 'Match' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('Match has aria-pressed=true during ACTIVE+scored', () => {
      mockPhase = 'ACTIVE';
      mockScored = true;
      render(<SideMenu {...defaultProps()} />);

      expect(screen.getByRole('button', { name: 'Match' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: 'Preparation' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('neither is active during IDLE', () => {
      mockPhase = 'IDLE';
      render(<SideMenu {...defaultProps()} />);

      expect(screen.getByRole('button', { name: 'Preparation' })).toHaveAttribute('aria-pressed', 'false');
      expect(screen.getByRole('button', { name: 'Match' })).toHaveAttribute('aria-pressed', 'false');
    });
  });

  describe('Next Stage tooltip', () => {
    beforeEach(() => {
      mockCompetitionId = 'comp-1';
    });

    it('shows "End Preparation" during ACTIVE+!scored', () => {
      mockPhase = 'ACTIVE';
      mockScored = false;
      render(<SideMenu {...defaultProps()} />);

      expect(screen.getByRole('button', { name: 'End Preparation' })).toBeInTheDocument();
    });

    it('shows "Advance" during SERIES_COMPLETE', () => {
      mockPhase = 'SERIES_COMPLETE';
      render(<SideMenu {...defaultProps()} />);

      expect(screen.getByRole('button', { name: 'Advance' })).toBeInTheDocument();
    });

    it('shows "Next Stage" during other phases', () => {
      mockPhase = 'IDLE';
      render(<SideMenu {...defaultProps()} />);

      expect(screen.getByRole('button', { name: 'Next Stage' })).toBeInTheDocument();
    });
  });

  describe('Print button disable', () => {
    it('Print button is disabled when onPrintClick is not specified', () => {
      render(<SideMenu {...defaultProps()} />);

      expect(screen.getByRole('button', { name: 'Print' })).toBeDisabled();
    });

    it('Print button is enabled when onPrintClick is specified', () => {
      render(<SideMenu {...defaultProps({ onPrintClick: vi.fn() })} />);

      expect(screen.getByRole('button', { name: 'Print' })).toBeEnabled();
    });
  });
});
