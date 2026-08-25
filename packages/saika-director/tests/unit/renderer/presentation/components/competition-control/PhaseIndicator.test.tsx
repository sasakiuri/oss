import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PhaseIndicator } from '@/renderer/presentation/features/competition-control/components/PhaseIndicator';

describe('PhaseIndicator', () => {
  it('should render IDLE phase', () => {
    render(<PhaseIndicator phase="IDLE" />);
    expect(screen.getByText('IDLE')).toBeDefined();
  });

  it('should render STAGE_ENTERED phase', () => {
    render(<PhaseIndicator phase="STAGE_ENTERED" />);
    expect(screen.getByText('READY')).toBeDefined();
  });

  it('should render ACTIVE phase', () => {
    render(<PhaseIndicator phase="ACTIVE" />);
    expect(screen.getByText('ACTIVE')).toBeDefined();
  });

  it('should render FINISHED phase', () => {
    render(<PhaseIndicator phase="FINISHED" />);
    expect(screen.getByText('FINISHED')).toBeDefined();
  });

  it('should apply IDLE color class', () => {
    const { container } = render(<PhaseIndicator phase="IDLE" />);
    const span = container.querySelector('span');
    expect(span?.className).toContain('text-vscode-text-muted');
  });

  it('should apply STAGE_ENTERED color class', () => {
    const { container } = render(<PhaseIndicator phase="STAGE_ENTERED" />);
    const span = container.querySelector('span');
    expect(span?.className).toContain('text-vscode-warning');
  });

  it('should apply ACTIVE color class', () => {
    const { container } = render(<PhaseIndicator phase="ACTIVE" />);
    const span = container.querySelector('span');
    expect(span?.className).toContain('text-vscode-success');
  });

  it('should apply FINISHED color class', () => {
    const { container } = render(<PhaseIndicator phase="FINISHED" />);
    const span = container.querySelector('span');
    expect(span?.className).toContain('text-vscode-accent');
  });
});
