import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OperationalProfilePanel } from '@/renderer/presentation/features/operational-profiles/OperationalProfilePanel';
import { operationalProfilesService } from '@/renderer/services';

vi.mock('@/renderer/services', () => ({ operationalProfilesService: { preview: vi.fn(), apply: vi.fn() } }));
vi.mock('@/renderer/presentation/features/operational-profiles/OperationalTemplatePanel', () => ({
  OperationalTemplatePanel: () => null,
}));

describe('OperationalProfilePanel', () => {
  beforeEach(() => vi.resetAllMocks());
  it('composes suggestions with the draft, allows overrides and preserves unrelated settings until explicit application', async () => {
    vi.mocked(operationalProfilesService.preview).mockImplementation(
      async (input): ReturnType<typeof operationalProfilesService.preview> => ({
        success: true,
        data: {
          competitionId: input.competitionId,
          fingerprint: 'a'.repeat(64),
          presets: [
            {
              id: 'external',
              label: 'External equipment',
              description: 'Officials operate signals.',
              modes: { clock: 'ADVISORY' },
              issues: [],
            },
            {
              id: 'missing',
              label: 'Unavailable equipment',
              description: '',
              modes: { absent: 'REQUIRED' },
              issues: ['Not installed'],
            },
          ],
          changes: [
            {
              id: 'clock',
              label: 'Clock quality',
              scope: 'DIRECTOR',
              before: 'REQUIRED',
              after: input.modes.clock ?? 'REQUIRED',
              context: '',
            },
            {
              id: 'backup',
              label: 'Backup capture',
              scope: 'COMPETITION',
              before: 'DISABLED',
              after: input.modes.backup ?? 'DISABLED',
              context: '',
            },
          ],
        },
      }),
    );
    render(<OperationalProfilePanel competitionId="competition" onApplied={() => {}} />);
    await screen.findByLabelText('Backup capture mode');
    fireEvent.change(screen.getByLabelText('Backup capture mode'), { target: { value: 'REQUIRED' } });
    await waitFor(() => expect(screen.getByLabelText('Backup capture mode')).toHaveValue('REQUIRED'));
    expect(screen.getByRole('button', { name: 'Unavailable equipment' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'External equipment' }));
    await waitFor(() => expect(screen.getByLabelText('Clock quality mode')).toHaveValue('ADVISORY'));
    expect(screen.getByLabelText('Backup capture mode')).toHaveValue('REQUIRED');
    fireEvent.change(screen.getByLabelText('Clock quality mode'), { target: { value: 'REQUIRED' } });
    await waitFor(() => expect(screen.getByLabelText('Clock quality mode')).toHaveValue('REQUIRED'));
    expect(operationalProfilesService.preview).toHaveBeenLastCalledWith({
      competitionId: 'competition',
      modes: { clock: 'REQUIRED', backup: 'REQUIRED' },
    });
    expect(operationalProfilesService.apply).not.toHaveBeenCalled();
  });
  it('discards proposed settings and pending results when changing competitions', async () => {
    vi.mocked(operationalProfilesService.preview).mockImplementation(async (input) => ({
      success: true,
      data: {
        competitionId: input.competitionId,
        fingerprint: 'a'.repeat(64),
        changes: [
          {
            id: 'clock',
            label: 'Clock quality',
            scope: 'DIRECTOR',
            before: 'ADVISORY',
            after: input.modes.clock ?? 'ADVISORY',
            context: '',
          },
        ],
      },
    }));
    let complete!: (value: Awaited<ReturnType<typeof operationalProfilesService.apply>>) => void;
    vi.mocked(operationalProfilesService.apply).mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    const onApplied = vi.fn();
    const view = render(<OperationalProfilePanel competitionId="first" onApplied={onApplied} />);
    await screen.findByLabelText('Clock quality mode');
    fireEvent.click(screen.getByRole('button', { name: 'Require all listed checks' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Apply reviewed settings' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Apply reviewed settings' }));
    view.rerender(<OperationalProfilePanel competitionId="second" onApplied={onApplied} />);
    await waitFor(() => expect(screen.getByLabelText('Clock quality mode')).toHaveValue('ADVISORY'));
    expect(operationalProfilesService.preview).toHaveBeenLastCalledWith({ competitionId: 'second', modes: {} });
    await act(async () => complete({ success: true, data: { complete: true, results: [] } }));
    expect(onApplied).not.toHaveBeenCalled();
    expect(screen.queryByText('Settings confirmed.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply reviewed settings' })).toBeDisabled();
  });
  it('keeps authentication required when selecting advisory checks and offers only supported modes', async () => {
    vi.mocked(operationalProfilesService.preview).mockImplementation(async (input) => ({
      success: true,
      data: {
        competitionId: input.competitionId,
        fingerprint: 'a'.repeat(64),
        changes: [
          {
            id: 'access',
            label: 'Authentication',
            scope: 'DIRECTOR',
            before: 'REQUIRED',
            after: input.modes.access ?? 'REQUIRED',
            context: '',
            supportedModes: ['DISABLED', 'REQUIRED'],
          },
          {
            id: 'clock',
            label: 'Clock quality',
            scope: 'DIRECTOR',
            before: 'REQUIRED',
            after: input.modes.clock ?? 'REQUIRED',
            context: '',
          },
        ],
      },
    }));
    render(<OperationalProfilePanel competitionId="competition" onApplied={() => {}} />);
    const access = await screen.findByLabelText('Authentication mode');
    expect(within(access).queryByRole('option', { name: 'Advisory' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use advisory checks' }));
    await waitFor(() => expect(screen.getByLabelText('Clock quality mode')).toHaveValue('ADVISORY'));
    expect(screen.getByLabelText('Authentication mode')).toHaveValue('REQUIRED');
  });
  it('previews mode changes before applying and displays an individual failure', async () => {
    vi.mocked(operationalProfilesService.preview).mockImplementation(async (input) => ({
      success: true,
      data: {
        competitionId: input.competitionId,
        fingerprint: 'a'.repeat(64),
        changes: [
          {
            id: 'clock',
            label: 'Clock quality',
            scope: 'DIRECTOR',
            before: 'ADVISORY',
            after: input.modes.clock ?? 'ADVISORY',
            context: 'existing thresholds',
          },
        ],
      },
    }));
    vi.mocked(operationalProfilesService.apply).mockResolvedValue({
      success: true,
      data: { complete: false, results: [{ id: 'clock', status: 'FAILED', message: 'Another competition is active' }] },
    });
    const applied = vi.fn();
    render(<OperationalProfilePanel competitionId="11111111-1111-4111-8111-111111111111" onApplied={applied} />);
    expect(await screen.findByText('All competitions')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Require all listed checks' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Apply reviewed settings' })).toBeEnabled());
    expect(operationalProfilesService.apply).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Apply reviewed settings' }));
    expect(await screen.findByText(/Another competition is active/)).toBeInTheDocument();
    expect(operationalProfilesService.apply).toHaveBeenCalledWith(
      expect.objectContaining({ modes: { clock: 'REQUIRED' }, fingerprint: 'a'.repeat(64) }),
    );
    expect(applied).toHaveBeenCalledOnce();
  });
});
