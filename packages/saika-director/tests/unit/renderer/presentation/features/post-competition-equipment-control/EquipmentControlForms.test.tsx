import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  ConfirmationForm,
  NoticeForm,
  SelectionForm,
  TestForm,
} from '@/renderer/presentation/features/post-competition-equipment-control/EquipmentControlForms';
import type { ParticipantDto, PostCompetitionEquipmentCheckDto } from '@/shared/ipc/contracts';

const CHAMPIONSHIP_ID = '11111111-1111-4111-8111-111111111111';
const EVENT_ID = '22222222-2222-4222-8222-222222222222';
const CHECK_ID = '44444444-4444-4444-8444-444444444444';
const NOW = '2026-09-07T01:02:03.000Z';

function participant(id: string, playerName: string, startNumber: string | null): ParticipantDto {
  return { id, playerName, affiliation: 'JPN', logoPath: null, sortOrder: 0, startNumber };
}

const ALEX = participant('33333333-3333-4333-8333-333333333333', 'Alex Athlete', '42');
const BLAIR = participant('55555555-5555-4555-8555-555555555555', 'Blair Athlete', null);

function checkFixture(overrides: Partial<PostCompetitionEquipmentCheckDto> = {}): PostCompetitionEquipmentCheckDto {
  return {
    id: CHECK_ID,
    championshipId: CHAMPIONSHIP_ID,
    eventId: EVENT_ID,
    eventName: '25m Pistol Women',
    eventType: 'P25W',
    round: 'Qualification',
    participantId: ALEX.id,
    athleteName: 'Alex Athlete',
    startNumber: '42',
    gender: 'F',
    selectionBasis: 'RANDOM_DRAW',
    selectionStatement: 'Draw witnessed by the Equipment Control Jury',
    selectedBy: 'Jury A',
    selectedAt: NOW,
    recordedAt: NOW,
    ruleReferences: ['ISSF 6.7.9.1'],
    status: 'SELECTED',
    separateDisqualificationActionRequired: false,
    sanctionAuthorityReference: `EQUIPMENT-CONTROL:${CHECK_ID}`,
    entries: [],
    ...overrides,
  };
}

const ISO_TIMESTAMP = expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/);

describe('SelectionForm', () => {
  it('resets the athlete selection when the basis changes and excludes athletes already selected on it', async () => {
    const onSelect = vi.fn().mockResolvedValue(true);
    render(
      <SelectionForm
        championshipId={CHAMPIONSHIP_ID}
        eventId={EVENT_ID}
        participants={[ALEX, BLAIR]}
        checks={[checkFixture({ selectionBasis: 'PISTOL_TRIGGER_RANDOM_DRAW' })]}
        disabled={false}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: /Alex Athlete/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Blair Athlete/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Alex Athlete/ }));
    expect(screen.getByRole('button', { name: 'Record selection (1)' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Selection basis/), { target: { value: 'PISTOL_TRIGGER_RANDOM_DRAW' } });

    expect(screen.getByText('ISSF 8.4.2.3; record the number of attempts during the test')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record selection (0)' })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /Alex Athlete/ })).toBeDisabled();
    expect(screen.getByText(/Start 42 · gender unspecified · already selected on this basis/)).toBeInTheDocument();
    expect(screen.getByText(/Start not assigned · gender unspecified/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: /Blair Athlete/ }));
    fireEvent.change(screen.getByLabelText('Selecting official'), { target: { value: ' Jury B ' } });
    fireEvent.change(screen.getByLabelText('Selection record'), { target: { value: '  Trigger draw No. 7  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record selection (1)' }));

    await waitFor(() =>
      expect(onSelect).toHaveBeenCalledWith(
        {
          championshipId: CHAMPIONSHIP_ID,
          eventId: EVENT_ID,
          participantIds: [BLAIR.id],
          selectionBasis: 'PISTOL_TRIGGER_RANDOM_DRAW',
          selectionStatement: 'Trigger draw No. 7',
          selectedBy: 'Jury B',
          selectedAt: ISO_TIMESTAMP,
        },
        expect.any(Function),
      ),
    );
  });

  it('requires a selection record before recording athletes', () => {
    render(
      <SelectionForm
        championshipId={CHAMPIONSHIP_ID}
        eventId={EVENT_ID}
        participants={[ALEX]}
        checks={[]}
        disabled={false}
        onSelect={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('checkbox', { name: /Alex Athlete/ }));
    fireEvent.change(screen.getByLabelText('Selecting official'), { target: { value: 'Jury A' } });
    fireEvent.change(screen.getByLabelText('Selection record'), { target: { value: '   ' } });

    expect(screen.getByRole('button', { name: 'Record selection (1)' })).toBeDisabled();
  });
});

describe('NoticeForm', () => {
  it('records the edited delivery method and statement of the written notice', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(<NoticeForm check={checkFixture()} disabled={false} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText('Delivery method'), {
      target: { value: ' Notice read aloud at the line ' },
    });
    fireEvent.change(screen.getByLabelText('Notice reference'), { target: { value: 'EC-7' } });
    fireEvent.change(screen.getByLabelText('Issuing official'), { target: { value: 'Officer A' } });
    fireEvent.change(screen.getByLabelText('Notice statement'), { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Record written notice' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Notice statement'), { target: { value: 'Report within 5 minutes' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record written notice' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        checkId: CHECK_ID,
        deliveryMethod: 'Notice read aloud at the line',
        noticeReference: 'EC-7',
        officialName: 'Officer A',
        statement: 'Report within 5 minutes',
        issuedAt: ISO_TIMESTAMP,
      }),
    );
  });
});

describe('TestForm', () => {
  function fillOperators() {
    fireEvent.change(screen.getByLabelText('Test operator'), { target: { value: 'Officer A' } });
    fireEvent.change(screen.getByLabelText('Equipment Control Jury supervisor'), { target: { value: 'Jury B' } });
  }

  it('records a failed trigger test with attempts and a same-gender judge for the clothing check', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(<TestForm check={checkFixture()} disabled={false} onSubmit={onSubmit} />);
    const submit = screen.getByRole('button', { name: 'Record test result' });

    fireEvent.change(screen.getByLabelText('Outcome'), { target: { value: 'FAILED' } });
    fireEvent.change(screen.getByLabelText(/Tested items/), {
      target: { value: 'Trigger pull, Jacket\nTrigger pull' },
    });
    fireEvent.change(screen.getByLabelText(/Attempts/), { target: { value: '3' } });
    fillOperators();
    fireEvent.change(screen.getByLabelText('Test statement'), { target: { value: 'Trigger failed at 1000 g' } });
    expect(submit).toBeEnabled();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Clothing or taping check' }));
    expect(submit).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: /Same-gender judge was available/ }));
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        checkId: CHECK_ID,
        outcome: 'FAILED',
        testedItems: ['Trigger pull', 'Jacket'],
        clothingOrTapingCheck: true,
        sameGenderJudgeAvailable: true,
        attempts: 3,
        performedBy: 'Officer A',
        equipmentControlJurySupervisor: 'Jury B',
        statement: 'Trigger failed at 1000 g',
        testedAt: ISO_TIMESTAMP,
      }),
    );
  });

  it('clears the same-gender judge answer when the clothing check is withdrawn', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(<TestForm check={checkFixture()} disabled={false} onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText(/Tested items/), { target: { value: 'Jacket' } });
    fillOperators();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Clothing or taping check' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Same-gender judge was available/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Clothing or taping check' }));

    expect(screen.queryByRole('checkbox', { name: /Same-gender judge was available/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Clothing or taping check' }));
    expect(screen.getByRole('checkbox', { name: /Same-gender judge was available/ })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Record test result' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Clothing or taping check' }));
    fireEvent.click(screen.getByRole('button', { name: 'Record test result' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: 'PASSED',
          testedItems: ['Jacket'],
          clothingOrTapingCheck: false,
          sameGenderJudgeAvailable: null,
          attempts: null,
        }),
      ),
    );
  });

  it('allows a non-report only after written notice and sends no tested items', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    const { unmount } = render(<TestForm check={checkFixture()} disabled={false} onSubmit={onSubmit} />);
    expect(screen.getByRole('option', { name: /Did not report — written notice required/ })).toBeDisabled();
    unmount();

    render(<TestForm check={checkFixture({ status: 'NOTIFIED' })} disabled={false} onSubmit={onSubmit} />);
    expect(screen.getByRole('heading', { name: '2. Record test or non-report' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Tested items/), { target: { value: 'Pistol' } });
    fireEvent.change(screen.getByLabelText('Outcome'), { target: { value: 'DID_NOT_REPORT' } });
    expect(screen.queryByLabelText(/Tested items/)).not.toBeInTheDocument();
    fillOperators();
    fireEvent.click(screen.getByRole('button', { name: 'Record test result' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'DID_NOT_REPORT', testedItems: [] })),
    );
  });
});

describe('ConfirmationForm', () => {
  it('records the selected Jury role and the edited confirmation statement', async () => {
    const onSubmit = vi.fn().mockResolvedValue(true);
    render(
      <ConfirmationForm
        check={checkFixture({ status: 'FAILED_PENDING_CONFIRMATION' })}
        disabled={false}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByLabelText('Calibration reference'), { target: { value: 'Scale CAL-2026-04' } });
    fireEvent.change(screen.getByLabelText('Confirming Jury member'), { target: { value: 'Jury C' } });
    fireEvent.change(screen.getByLabelText('Jury role'), { target: { value: 'COMPETITION_JURY_MEMBER' } });
    fireEvent.change(screen.getByLabelText('Confirmation statement'), { target: { value: ' ' } });
    expect(screen.getByRole('button', { name: 'Confirm test and procedure' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Confirmation statement'), {
      target: { value: 'Retest confirmed failure' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm test and procedure' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        checkId: CHECK_ID,
        calibrationReference: 'Scale CAL-2026-04',
        confirmedBy: 'Jury C',
        confirmerRole: 'COMPETITION_JURY_MEMBER',
        statement: 'Retest confirmed failure',
        confirmedAt: ISO_TIMESTAMP,
      }),
    );
  });
});
