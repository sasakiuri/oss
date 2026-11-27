// SPDX-License-Identifier: MIT

import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RangeOfficerMenu } from '@/renderer/presentation/components/RangeOfficerMenu';

const mocks = vi.hoisted(() => ({
  getRequest: vi.fn(),
  request: vi.fn(),
  clearRequest: vi.fn(),
  getMalfunction: vi.fn(),
  getEst: vi.fn(),
}));

vi.mock('@/renderer/services/mqttService', () => ({
  mqttService: {
    getRangeOfficerRequest: mocks.getRequest,
    requestRangeOfficer: mocks.request,
    clearRangeOfficerRequest: mocks.clearRequest,
    getQualificationMalfunctionSignal: mocks.getMalfunction,
    getEstComplaintSignal: mocks.getEst,
    getMqttStatus: vi.fn().mockResolvedValue({ status: 'connected' }),
  },
}));

const activeRequest = { status: 'ACTIVE', requestId: 'request-1', category: 'ASSISTANCE' };

describe('RangeOfficerMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRequest.mockResolvedValue({ status: 'CLEARED' });
    mocks.getMalfunction.mockResolvedValue({ status: 'CLEARED' });
    mocks.getEst.mockResolvedValue({ status: 'CLEARED' });
    mocks.request.mockImplementation(async () => {
      mocks.getRequest.mockResolvedValue(activeRequest);
      return activeRequest;
    });
    mocks.clearRequest.mockImplementation(async () => {
      mocks.getRequest.mockResolvedValue({ status: 'CLEARED' });
      return { status: 'CLEARED' };
    });
  });

  it('keeps report choices hidden until requested and returns keyboard focus after closing', async () => {
    const user = userEvent.setup();
    render(<RangeOfficerMenu />);
    const trigger = screen.getByRole('button', { name: 'Range Officer' });
    expect(screen.queryByRole('button', { name: 'Call RO' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    trigger.focus();
    await user.keyboard('{Enter}');
    const menu = screen.getByRole('dialog', { name: 'Range Officer' });
    expect(within(menu).getByRole('button', { name: 'Declare malfunction' })).toBeInTheDocument();
    expect(within(menu).getByRole('button', { name: 'EST complaint' })).toBeInTheDocument();
    await user.click(within(menu).getByRole('button', { name: 'Call RO' }));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: 'Range Officer request' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(mocks.request).not.toHaveBeenCalled();
  });

  it('retains a draft and active indication when the dialogs are closed, then clears by request identity', async () => {
    const user = userEvent.setup();
    render(<RangeOfficerMenu />);
    const openRequest = async () => {
      await user.click(screen.getByRole('button', { name: /^Range Officer/ }));
      await user.click(screen.getByRole('button', { name: /^Call RO/ }));
    };

    await openRequest();
    await user.type(screen.getByLabelText('Details (optional)'), 'Please check the equipment');
    await user.keyboard('{Escape}');
    await openRequest();
    expect(screen.getByLabelText('Details (optional)')).toHaveValue('Please check the equipment');
    await user.click(screen.getByRole('button', { name: 'Call Range Officer' }));
    await waitFor(() =>
      expect(mocks.request).toHaveBeenCalledWith({
        category: 'ASSISTANCE',
        message: 'Please check the equipment',
      }),
    );
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Range Officer (active requests)' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Range Officer (active requests)' }));
    expect(screen.getByRole('button', { name: 'Call RO Active' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Call RO Active' }));
    await user.click(screen.getByRole('button', { name: 'Clear request' }));
    await waitFor(() => expect(mocks.clearRequest).toHaveBeenCalledWith({ requestId: 'request-1' }));
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Range Officer' })).toBeInTheDocument();
  });

  it('shows restored reports before opening and keeps the indication until all reports are cleared', async () => {
    mocks.getRequest.mockResolvedValue(activeRequest);
    mocks.getMalfunction.mockResolvedValue({ status: 'ACTIVE' });
    mocks.getEst.mockResolvedValue({ status: 'ACTIVE' });
    const user = userEvent.setup();
    render(<RangeOfficerMenu />);

    await user.click(await screen.findByRole('button', { name: 'Range Officer (active requests)' }));
    expect(screen.getByRole('button', { name: 'Call RO Active' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Declare malfunction Active' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'EST complaint Active' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Call RO Active' }));
    await user.click(screen.getByRole('button', { name: 'Clear request' }));
    await waitFor(() => expect(mocks.clearRequest).toHaveBeenCalled());
    await user.keyboard('{Escape}');
    expect(screen.getByRole('button', { name: 'Range Officer (active requests)' })).toBeInTheDocument();
  });
});
