import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OperationalTemplatePanel } from '@/renderer/presentation/features/operational-profiles/OperationalTemplatePanel';
import { operationalTemplatesService } from '@/renderer/services';
import type { OperationalProfilePreviewDto, OperationalTemplateDto } from '@/shared/ipc/contracts';
import { fail, ok } from '../../../../../helpers/renderer/serviceResponses';

vi.mock('@/renderer/services', () => ({
  operationalTemplatesService: { list: vi.fn(), save: vi.fn(), remove: vi.fn() },
}));

const template: OperationalTemplateDto = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Club evening',
  description: 'Manual equipment',
  modes: { relay: 'ADVISORY' },
  revision: 2,
  updatedAt: '2026-09-09T00:00:00.000Z',
};
const settings: OperationalProfilePreviewDto['changes'] = [
  { id: 'relay', label: 'Relay', scope: 'COMPETITION', before: 'DISABLED', after: 'REQUIRED', context: '' },
];
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(operationalTemplatesService.list).mockResolvedValue(ok([template]));
});

describe('Operational template editor', () => {
  it('loads a template only on request and saves drafts independently of applying active settings', async () => {
    const onChoose = vi.fn();
    vi.mocked(operationalTemplatesService.save).mockResolvedValue(
      ok({ ...template, revision: 3, modes: { relay: 'REQUIRED' } }),
    );
    render(
      <OperationalTemplatePanel
        modes={{ relay: 'REQUIRED' }}
        settings={settings}
        onChoose={onChoose}
        disabled={false}
      />,
    );
    await screen.findByRole('option', { name: 'Club evening' });
    fireEvent.change(screen.getByLabelText('Saved operational template'), { target: { value: template.id } });
    expect(onChoose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Add template to proposed settings' }));
    expect(onChoose).toHaveBeenCalledWith({ relay: 'ADVISORY' });
    fireEvent.click(screen.getByRole('button', { name: 'Replace template with proposed settings' }));
    await screen.findByText('Template saved.');
    expect(operationalTemplatesService.save).toHaveBeenCalledWith({
      id: template.id,
      expectedRevision: 2,
      name: template.name,
      description: template.description,
      modes: { relay: 'REQUIRED' },
    });
    expect(onChoose).toHaveBeenCalledTimes(1);
  });

  it('blocks unsupported templates and lets stale-removal errors be reloaded without changing the draft', async () => {
    const onChoose = vi.fn();
    vi.mocked(operationalTemplatesService.remove).mockResolvedValue(fail('Template changed; reload it', 'ERROR'));
    render(<OperationalTemplatePanel modes={{}} settings={[]} onChoose={onChoose} disabled={false} />);
    await screen.findByRole('option', { name: 'Club evening' });
    fireEvent.change(screen.getByLabelText('Saved operational template'), { target: { value: template.id } });
    expect(screen.getByRole('button', { name: 'Add template to proposed settings' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save as new template' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Remove template' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Template changed');
    expect(operationalTemplatesService.remove).toHaveBeenCalledWith({ id: template.id, expectedRevision: 2 });
    vi.mocked(operationalTemplatesService.list).mockResolvedValue(ok([]));
    fireEvent.click(screen.getByRole('button', { name: 'Reload templates' }));
    await waitFor(() => expect(screen.queryByRole('option', { name: 'Club evening' })).not.toBeInTheDocument());
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('shows the fallback text when a removal fails without a message, and load and save failures as text', async () => {
    vi.mocked(operationalTemplatesService.remove).mockResolvedValue({ success: false });
    render(
      <OperationalTemplatePanel
        modes={{ relay: 'REQUIRED' }}
        settings={settings}
        onChoose={vi.fn()}
        disabled={false}
      />,
    );
    await screen.findByRole('option', { name: 'Club evening' });
    fireEvent.change(screen.getByLabelText('Saved operational template'), { target: { value: template.id } });
    fireEvent.click(screen.getByRole('button', { name: 'Remove template' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/^Unable to remove template$/);

    vi.mocked(operationalTemplatesService.save).mockResolvedValue(fail('Template name already used', 'CONFLICT'));
    fireEvent.click(screen.getByRole('button', { name: 'Replace template with proposed settings' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/^Template name already used$/));

    vi.mocked(operationalTemplatesService.list).mockResolvedValue(fail('Templates are unavailable', 'ERROR'));
    fireEvent.click(screen.getByRole('button', { name: 'Reload templates' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/^Templates are unavailable$/));
  });
});
