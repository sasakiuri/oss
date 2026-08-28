import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IncidentReportPrintScreen } from '@/renderer/presentation/features/print/IncidentReportPrintScreen';

const REPORT_ID = '11111111-1111-4111-8111-111111111111';
const { getById } = vi.hoisted(() => ({ getById: vi.fn() }));

vi.mock('@/renderer/services', () => ({ incidentReportsService: { getById } }));

describe('IncidentReportPrintScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getById.mockResolvedValue({
      success: true,
      data: {
        id: REPORT_ID,
        eventId: '22222222-2222-4222-8222-222222222222',
        serialNumber: 'IR-42',
        eventName: '10m Air Rifle',
        occurredAt: '2026-08-29T01:02:03.000Z',
        relayNumber: 1,
        firingPointNumber: 12,
        athleteName: 'Alex Athlete',
        bibNumber: null,
        nationality: 'JPN',
        stage: 'Qualification',
        series: '3',
        details: 'Target stopped responding.',
        ruleReferences: '6.14.6',
        penalty: 'Extra time granted',
        scoreAmendmentReference: null,
        initiatorRole: 'RANGE_OFFICER',
        initiatorName: 'Range Officer A',
        createdAt: '2026-08-29T01:05:00.000Z',
        entries: [],
        linkedDecisions: [],
        missingSignatureRoles: [],
        forwarded: false,
        voided: false,
      },
    });
  });

  it('loads the immutable report projection into a printable operational copy', async () => {
    render(<IncidentReportPrintScreen config={{ type: 'incident-report-print', reportId: REPORT_ID }} />);

    expect(await screen.findByRole('heading', { name: 'RANGE INCIDENT REPORT' })).toBeInTheDocument();
    expect(screen.getByText('IR-42')).toBeInTheDocument();
    expect(screen.getByText('Target stopped responding.')).toBeInTheDocument();
    expect(getById).toHaveBeenCalledWith({ reportId: REPORT_ID });
  });
});
