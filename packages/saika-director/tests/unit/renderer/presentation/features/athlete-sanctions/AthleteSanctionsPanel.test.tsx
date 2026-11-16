import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AthleteSanctionsPanel } from '@/renderer/presentation/features/athlete-sanctions/AthleteSanctionsPanel';
import { useConfirmDialogStore } from '@/renderer/presentation/stores/ui/confirmDialog.store';
import { athleteSanctionsService } from '@/renderer/services';
import type {
  AthleteIdentityDto,
  AthleteIdentityLinkDto,
  AthleteSanctionDecisionDto,
  AthleteSanctionWorkspaceDto,
} from '@/shared/ipc/contracts';
import { fail, ok } from '../../../../../helpers/renderer/serviceResponses';

vi.mock('@/renderer/services', async () =>
  (await import('../../../../../helpers/renderer/mockServices')).mockServices(),
);
const {
  getWorkspace,
  synchronizeIssfIdentities,
  createIdentity,
  linkParticipant,
  unlinkParticipant,
  imposeSanction,
  revokeSanction,
} = vi.mocked(athleteSanctionsService);

const CHAMPIONSHIP_ID = '11111111-1111-4111-8111-111111111111';
const EVENT_MEN = '21111111-1111-4111-8111-111111111111';
const EVENT_MIXED = '22222222-2222-4222-8222-222222222222';
const PARTICIPANT_ONE_MEN = '31111111-1111-4111-8111-111111111111';
const PARTICIPANT_ONE_MIXED = '32222222-2222-4222-8222-222222222222';
const PARTICIPANT_TWO_MEN = '33333333-3333-4333-8333-333333333333';
const PARTICIPANT_THREE_MIXED = '34444444-4444-4444-8444-444444444444';
const ARCHIVED_PARTICIPANT = '35555555-5555-4555-8555-555555555555';
const IDENTITY_ONE = '41111111-1111-4111-8111-111111111111';
const IDENTITY_TWO = '42222222-2222-4222-8222-222222222222';
const LINK_ONE = '51111111-1111-4111-8111-111111111111';
const LINK_TWO = '52222222-2222-4222-8222-222222222222';
const LINK_ARCHIVED = '53333333-3333-4333-8333-333333333333';
const SANCTION_ONE = '61111111-1111-4111-8111-111111111111';

const ERROR_CLASS = 'border-l-2 border-vscode-error pl-3 text-xs text-vscode-error';
const NOTICE_CLASS = 'border-l-2 border-vscode-success pl-3 text-xs text-vscode-success';
const INPUT_CLASSES =
  'min-h-8 w-full rounded-[2px] border border-vscode-border bg-vscode-input px-2 py-1 text-xs text-vscode-text outline-none';

function identity(id: string, displayName: string, issfId: string | null): AthleteIdentityDto {
  return {
    id,
    championshipId: CHAMPIONSHIP_ID,
    displayName,
    issfId,
    createdBy: 'Jury Chair',
    creationStatement: 'Reconciled',
    createdAt: '2026-11-16T00:00:00.000Z',
  };
}

function link(
  id: string,
  athleteIdentityId: string,
  participantId: string,
  linkBasis: 'ISSF_ID' | 'MANUAL',
  snapshot = { playerName: 'Snapshot name', eventName: 'Snapshot event' },
): AthleteIdentityLinkDto {
  return {
    id,
    athleteIdentityId,
    participantId,
    eventIdSnapshot: EVENT_MEN,
    eventNameSnapshot: snapshot.eventName,
    playerNameSnapshot: snapshot.playerName,
    issfIdSnapshot: null,
    entryType: 'LINKED',
    linkBasis,
    statement: 'Linked',
    officialName: 'Jury Chair',
    recordedAt: '2026-11-16T00:00:00.000Z',
    reversesLinkId: null,
  };
}

function sanction(overrides: Partial<AthleteSanctionDecisionDto> = {}): AthleteSanctionDecisionDto {
  return {
    id: SANCTION_ONE,
    athleteIdentityId: IDENTITY_ONE,
    sourceEventId: EVENT_MEN,
    decisionType: 'IMPOSED',
    classificationCode: 'DSQ',
    scope: 'EVENT',
    authorityBasis: 'POST_COMPETITION_CHECK',
    authorityReference: 'Jury minutes 4',
    officialName: 'Jury Chair',
    officialRole: 'EQUIPMENT_CONTROL_JURY',
    officialActorId: null,
    authorizationMode: 'MANUAL_ATTESTATION',
    ruleReference: 'ISSF 6.12.6',
    incidentReportNumber: null,
    publicRemark: 'Disqualified for equipment',
    internalNote: null,
    decidedAt: '2026-11-16T01:00:00.000Z',
    recordedAt: '2026-11-16T01:00:00.000Z',
    reversesDecisionId: null,
    ...overrides,
  };
}

function entry(participantId: string, eventId: string, eventName: string, playerName: string, issfId: string | null) {
  return {
    participantId,
    eventId,
    eventName,
    championshipId: CHAMPIONSHIP_ID,
    playerName,
    issfId,
    entryStatus: 'COMPETING' as const,
  };
}

function workspace(overrides: Partial<AthleteSanctionWorkspaceDto> = {}): AthleteSanctionWorkspaceDto {
  const activeLinks = [
    link(LINK_ONE, IDENTITY_ONE, PARTICIPANT_ONE_MEN, 'ISSF_ID'),
    link(LINK_ARCHIVED, IDENTITY_ONE, ARCHIVED_PARTICIPANT, 'MANUAL', {
      playerName: 'Athlete One (old)',
      eventName: 'Old event',
    }),
    link(LINK_TWO, IDENTITY_TWO, PARTICIPANT_TWO_MEN, 'MANUAL'),
  ];
  return {
    championshipId: CHAMPIONSHIP_ID,
    identities: [identity(IDENTITY_ONE, 'Athlete One', 'ISSF-1'), identity(IDENTITY_TWO, 'Athlete Two', null)],
    participantEntries: [
      entry(PARTICIPANT_ONE_MEN, EVENT_MEN, 'Air Rifle Men', 'Athlete One', 'ISSF-1'),
      entry(PARTICIPANT_ONE_MIXED, EVENT_MIXED, 'Air Rifle Mixed Team', 'Athlete One', 'ISSF-1'),
      entry(PARTICIPANT_TWO_MEN, EVENT_MEN, 'Air Rifle Men', 'Athlete Two', null),
      entry(PARTICIPANT_THREE_MIXED, EVENT_MIXED, 'Air Rifle Mixed Team', 'Athlete Three', null),
    ],
    linkHistory: activeLinks,
    activeLinks,
    sanctionHistory: [],
    activeSanctions: [],
    ...overrides,
  };
}

const emptyWorkspace = () =>
  workspace({ identities: [], activeLinks: [], linkHistory: [], activeSanctions: [], sanctionHistory: [] });

async function renderPanel(loaded: AthleteSanctionWorkspaceDto = workspace()) {
  getWorkspace.mockResolvedValue(ok(loaded));
  render(<AthleteSanctionsPanel championshipId={CHAMPIONSHIP_ID} />);
  if (loaded.identities.length > 0) await screen.findByRole('heading', { name: loaded.identities[0]!.displayName });
  else await screen.findByText(/^No cross-event identities yet\./);
}

async function answerConfirm(confirmed: boolean): Promise<string> {
  await waitFor(() => expect(useConfirmDialogStore.getState().isOpen).toBe(true));
  const { message } = useConfirmDialogStore.getState();
  act(() => {
    if (confirmed) useConfirmDialogStore.getState().handleConfirm();
    else useConfirmDialogStore.getState().handleCancel();
  });
  return message;
}

const type = (label: string | HTMLElement, value: string) =>
  fireEvent.change(typeof label === 'string' ? screen.getByLabelText(label) : label, { target: { value } });
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const card = (displayName: string) => screen.getByRole('heading', { name: displayName }).closest('article')!;

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  useConfirmDialogStore.setState({ isOpen: false, message: '', resolve: null });
});

describe('AthleteSanctionsPanel workspace', () => {
  it('summarizes the identities, sanctions and unlinked entries', async () => {
    await renderPanel(workspace({ activeSanctions: [sanction()] }));

    expect(
      screen.getByText('2 championship identity record(s) · 1 active sanction(s) · 2 event entry/entries not linked'),
    ).toBeInTheDocument();
    expect(getWorkspace).toHaveBeenCalledWith({ championshipId: CHAMPIONSHIP_ID });
    const one = within(card('Athlete One'));
    expect(one.getByText('ISSF ID: ISSF-1')).toBeInTheDocument();
    expect(one.getByText('Air Rifle Men · ISSF_ID')).toBeInTheDocument();
    expect(one.getByText('Athlete One (old)')).toBeInTheDocument();
    expect(one.getByText('Old event (archived entry) · MANUAL')).toBeInTheDocument();
    expect(within(card('Athlete Two')).getByText('ISSF ID: manual identity')).toBeInTheDocument();
  });

  it('shows the empty state without unlinked entries', async () => {
    await renderPanel(
      workspace({
        identities: [],
        activeLinks: [],
        participantEntries: [],
      }),
    );

    expect(screen.getByText('0 championship identity record(s) · 0 active sanction(s)')).toBeInTheDocument();
    expect(
      screen.getByText(
        'No cross-event identities yet. Reconcile entries with ISSF IDs, or create a reviewed manual identity.',
      ),
    ).toBeInTheDocument();
  });

  it('shows a failed load and clears it on a successful refresh', async () => {
    getWorkspace.mockResolvedValueOnce(fail('Championship not found')).mockResolvedValueOnce(ok(workspace()));
    render(<AthleteSanctionsPanel championshipId={CHAMPIONSHIP_ID} />);

    const banner = await screen.findByText('Championship not found');
    expect(banner.tagName).toBe('P');
    expect(banner).toHaveAttribute('class', ERROR_CLASS);
    expect(screen.getByText('0 championship identity record(s) · 0 active sanction(s)')).toBeInTheDocument();

    fireEvent.click(button('Refresh'));

    await screen.findByRole('heading', { name: 'Athlete One' });
    expect(screen.queryByText('Championship not found')).not.toBeInTheDocument();
  });

  it('styles the official inputs with the defined form colours', async () => {
    await renderPanel();

    expect(screen.getByLabelText('Recording official')).toHaveClass(INPUT_CLASSES);
    expect(screen.getByLabelText('Recording official')).toHaveAttribute('placeholder', 'Name on the audit record');
    expect(screen.getByLabelText('Identity-link statement')).toHaveClass(INPUT_CLASSES);
  });
});

describe('AthleteSanctionsPanel ISSF reconciliation', () => {
  it('reconciles with the recording official and statement and reports the counts', async () => {
    synchronizeIssfIdentities.mockResolvedValue(
      ok({ workspace: emptyWorkspace(), identitiesCreated: 1, participantsLinked: 2 }),
    );
    await renderPanel();
    expect(screen.getByLabelText('Identity-link statement')).toHaveValue(
      'Official entries reconciled against the ISSF ID',
    );
    expect(button('Reconcile ISSF IDs')).toBeDisabled();
    type('Recording official', '  Jury Chair  ');
    type('Identity-link statement', '  Checked against the entry list  ');

    fireEvent.click(button('Reconcile ISSF IDs'));

    const notice = await screen.findByText('1 identity record(s) created; 2 event entry link(s) added.');
    expect(notice).toHaveAttribute('class', NOTICE_CLASS);
    expect(synchronizeIssfIdentities).toHaveBeenCalledWith({
      championshipId: CHAMPIONSHIP_ID,
      officialName: 'Jury Chair',
      statement: 'Checked against the entry list',
    });
    expect(screen.getByText(/^0 championship identity record\(s\)/)).toBeInTheDocument();
  });

  it('replaces the previous notice with the next failure', async () => {
    synchronizeIssfIdentities
      .mockResolvedValueOnce(ok({ workspace: workspace(), identitiesCreated: 0, participantsLinked: 0 }))
      .mockResolvedValueOnce(fail('ISSF IDs conflict'));
    await renderPanel();
    type('Recording official', 'Jury Chair');
    fireEvent.click(button('Reconcile ISSF IDs'));
    await screen.findByText('0 identity record(s) created; 0 event entry link(s) added.');

    fireEvent.click(button('Reconcile ISSF IDs'));

    expect(await screen.findByText('ISSF IDs conflict')).toHaveAttribute('class', ERROR_CLASS);
    expect(screen.queryByText(/identity record\(s\) created/)).not.toBeInTheDocument();
  });

  it('needs an identity-link statement', async () => {
    await renderPanel();
    type('Recording official', 'Jury Chair');
    type('Identity-link statement', '   ');

    expect(button('Reconcile ISSF IDs')).toBeDisabled();
  });
});

describe('AthleteSanctionsPanel manual identity', () => {
  it('creates a reviewed identity from the selected unlinked entries', async () => {
    createIdentity.mockResolvedValue(ok(emptyWorkspace()));
    await renderPanel();
    type('Recording official', 'Jury Chair');
    fireEvent.click(button('Manual identity'));
    const form = within(screen.getByRole('heading', { name: 'Create reviewed identity' }).closest('section')!);
    expect(form.getAllByRole('checkbox').map((checkbox) => checkbox.closest('label')?.textContent)).toEqual([
      'Athlete One · Air Rifle Mixed TeamISSF ID: ISSF-1',
      'Athlete Three · Air Rifle Mixed TeamISSF ID: none',
    ]);
    expect(form.getByRole('button', { name: 'Create identity' })).toBeDisabled();

    type(form.getByLabelText('Display name'), '  Athlete Three  ');
    fireEvent.click(form.getByLabelText(/Athlete Three · Air Rifle Mixed Team/));
    fireEvent.click(form.getByLabelText(/Athlete One · Air Rifle Mixed Team/));
    fireEvent.change(form.getByLabelText('Link basis'), { target: { value: 'ISSF_ID' } });
    expect(form.getByRole('button', { name: 'Create identity' })).toBeDisabled();
    type(form.getByLabelText('ISSF ID (optional)'), '  ISSF-3  ');
    fireEvent.click(form.getByRole('button', { name: 'Create identity' }));

    expect(await screen.findByText('Manual championship identity created.')).toBeInTheDocument();
    expect(createIdentity).toHaveBeenCalledWith({
      championshipId: CHAMPIONSHIP_ID,
      displayName: 'Athlete Three',
      issfId: 'ISSF-3',
      participantIds: [PARTICIPANT_THREE_MIXED, PARTICIPANT_ONE_MIXED],
      linkBasis: 'ISSF_ID',
      statement: 'Official entries reconciled against the ISSF ID',
      officialName: 'Jury Chair',
    });
    expect(screen.queryByRole('heading', { name: 'Create reviewed identity' })).not.toBeInTheDocument();
  });

  it('keeps the form and its entries when the identity cannot be created', async () => {
    createIdentity.mockResolvedValue(fail('Entry already linked'));
    await renderPanel();
    type('Recording official', 'Jury Chair');
    fireEvent.click(button('Manual identity'));
    type('Display name', 'Athlete Three');
    fireEvent.click(screen.getByLabelText(/Athlete Three · Air Rifle Mixed Team/));

    fireEvent.click(button('Create identity'));

    expect(await screen.findByText('Entry already linked')).toHaveAttribute('class', ERROR_CLASS);
    expect(createIdentity.mock.calls[0]?.[0]).not.toHaveProperty('issfId');
    expect(createIdentity.mock.calls[0]?.[0]).toMatchObject({ linkBasis: 'MANUAL' });
    expect(screen.getByLabelText('Display name')).toHaveValue('Athlete Three');
    expect(screen.getByLabelText(/Athlete Three · Air Rifle Mixed Team/)).toBeChecked();
  });

  it('discards the draft when the form is hidden', async () => {
    await renderPanel();
    fireEvent.click(button('Manual identity'));
    type('Display name', 'Athlete Three');

    fireEvent.click(button('Manual identity'));
    fireEvent.click(button('Manual identity'));
    expect(screen.getByLabelText('Display name')).toHaveValue('');

    type('Display name', 'Athlete Three');
    fireEvent.click(button('Cancel'));
    expect(screen.queryByLabelText('Display name')).not.toBeInTheDocument();
  });
});

describe('AthleteSanctionsPanel identity links', () => {
  it('links another entry and resets the choice', async () => {
    linkParticipant.mockResolvedValue(ok(workspace()));
    await renderPanel();
    const one = within(card('Athlete One'));
    const [participant, basis] = one.getAllByRole('combobox');
    fireEvent.change(participant!, { target: { value: PARTICIPANT_THREE_MIXED } });
    fireEvent.change(basis!, { target: { value: 'ISSF_ID' } });
    expect(one.getByRole('button', { name: 'Link' })).toBeDisabled();
    type('Recording official', ' Jury Chair ');

    fireEvent.click(one.getByRole('button', { name: 'Link' }));

    expect(await screen.findByText('Event entry linked to the championship identity.')).toBeInTheDocument();
    expect(linkParticipant).toHaveBeenCalledWith({
      athleteIdentityId: IDENTITY_ONE,
      participantId: PARTICIPANT_THREE_MIXED,
      linkBasis: 'ISSF_ID',
      statement: 'Official entries reconciled against the ISSF ID',
      officialName: 'Jury Chair',
    });
    expect(participant).toHaveValue('');
    expect(basis).toHaveValue('ISSF_ID');
  });

  it('keeps the choice when the link fails', async () => {
    linkParticipant.mockResolvedValue(fail('Entry belongs to another identity'));
    await renderPanel();
    const one = within(card('Athlete One'));
    const [participant] = one.getAllByRole('combobox');
    expect(
      within(participant!)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual([
      'Link another event entry',
      'Athlete One — Air Rifle Mixed Team',
      'Athlete Three — Air Rifle Mixed Team',
    ]);
    fireEvent.change(participant!, { target: { value: PARTICIPANT_ONE_MIXED } });
    type('Recording official', 'Jury Chair');

    fireEvent.click(one.getByRole('button', { name: 'Link' }));

    expect(await screen.findByText('Entry belongs to another identity')).toHaveAttribute('class', ERROR_CLASS);
    expect(participant).toHaveValue(PARTICIPANT_ONE_MIXED);
  });

  it('asks before unlinking an entry', async () => {
    await renderPanel();
    const unlink = within(card('Athlete One')).getAllByRole('button', { name: 'Unlink' })[0]!;
    expect(unlink).toBeDisabled();
    type('Recording official', 'Jury Chair');

    fireEvent.click(unlink);

    expect(await answerConfirm(false)).toBe('Unlink Athlete One / Air Rifle Men from this identity?');
    expect(unlinkParticipant).not.toHaveBeenCalled();
  });

  it('unlinks an entry after confirmation', async () => {
    unlinkParticipant.mockResolvedValue(ok(workspace()));
    await renderPanel();
    type('Recording official', 'Jury Chair');

    fireEvent.click(within(card('Athlete One')).getAllByRole('button', { name: 'Unlink' })[1]!);
    expect(await answerConfirm(true)).toBe('Unlink Athlete One (old) / Old event (archived entry) from this identity?');

    expect(await screen.findByText('Event entry link reversed. The audit history was retained.')).toBeInTheDocument();
    expect(unlinkParticipant).toHaveBeenCalledWith({
      linkId: LINK_ARCHIVED,
      statement: 'Official entries reconciled against the ISSF ID',
      officialName: 'Jury Chair',
    });
  });

  it('shows a failed unlink', async () => {
    unlinkParticipant.mockResolvedValue(fail('Link already reversed'));
    await renderPanel();
    type('Recording official', 'Jury Chair');

    fireEvent.click(within(card('Athlete Two')).getByRole('button', { name: 'Unlink' }));
    await answerConfirm(true);

    expect(await screen.findByText('Link already reversed')).toHaveAttribute('class', ERROR_CLASS);
  });

  it('offers a sanction only for an identity with linked entries', async () => {
    await renderPanel(workspace({ activeLinks: [link(LINK_ONE, IDENTITY_ONE, PARTICIPANT_ONE_MEN, 'ISSF_ID')] }));

    expect(within(card('Athlete One')).getByRole('button', { name: 'Record sanction' })).toBeEnabled();
    expect(within(card('Athlete Two')).getByRole('button', { name: 'Record sanction' })).toBeDisabled();
  });
});

describe('AthleteSanctionsPanel sanction', () => {
  const twoEventWorkspace = () =>
    workspace({
      activeLinks: [
        link(LINK_ONE, IDENTITY_ONE, PARTICIPANT_ONE_MEN, 'ISSF_ID'),
        link(LINK_ARCHIVED, IDENTITY_ONE, PARTICIPANT_ONE_MIXED, 'ISSF_ID'),
        link(LINK_TWO, IDENTITY_TWO, PARTICIPANT_TWO_MEN, 'MANUAL'),
      ],
    });
  const sanctionForm = () => within(screen.getByRole('heading', { name: /^Record sanction · / }).closest('section')!);

  async function openSanctionForm(recordingOfficial = 'Jury Chair') {
    await renderPanel(twoEventWorkspace());
    type('Recording official', recordingOfficial);
    fireEvent.click(within(card('Athlete One')).getByRole('button', { name: 'Record sanction' }));
    return sanctionForm();
  }

  function fillRequired(form: ReturnType<typeof sanctionForm>) {
    type(form.getByLabelText('Authority reference'), '  Jury minutes 7  ');
    type(form.getByLabelText('Public result remark'), '  Disqualified  ');
  }

  it('opens with the recording official, the first linked event and the default rule', async () => {
    const form = await openSanctionForm('Jury Chair');

    expect(screen.getByRole('heading', { name: 'Record sanction · Athlete One' })).toBeInTheDocument();
    expect(
      form.getByText(
        "Enter the official's name and authority reference for this sanction. These details are recorded as entered.",
      ),
    ).toBeInTheDocument();
    expect(form.getByLabelText('Official name')).toHaveValue('Jury Chair');
    expect(form.getByLabelText('Rule reference')).toHaveValue('ISSF 6.12.6');
    const source = form.getByLabelText('Source event');
    expect(source).toHaveValue(EVENT_MEN);
    expect(
      within(source)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual(['Air Rifle Men', 'Air Rifle Mixed Team']);
    expect(form.getByLabelText('Authority basis')).toHaveValue('JURY_MAJORITY');
    expect(form.getByRole('button', { name: 'Record DSQ' })).toBeDisabled();

    type('Recording official', 'Someone else');
    expect(form.getByLabelText('Official name')).toHaveValue('Jury Chair');
  });

  it.each([
    {
      code: 'DSQ',
      basis: 'JURY_MAJORITY',
      expected: { scope: 'EVENT', authorityBasis: 'JURY_MAJORITY', officialRole: 'JURY_MEMBER' },
    },
    {
      code: 'DSQ',
      basis: 'POST_COMPETITION_CHECK',
      expected: {
        scope: 'EVENT',
        authorityBasis: 'POST_COMPETITION_CHECK',
        officialRole: 'EQUIPMENT_CONTROL_JURY',
      },
    },
    {
      code: 'DQB',
      basis: null,
      expected: { scope: 'CHAMPIONSHIP', authorityBasis: 'JURY_MAJORITY', officialRole: 'JURY_MEMBER' },
    },
    {
      code: 'AD_DSQ',
      basis: null,
      expected: {
        scope: 'CHAMPIONSHIP',
        authorityBasis: 'ANTI_DOPING_DECISION',
        officialRole: 'ANTI_DOPING_AUTHORITY',
      },
    },
  ])('records $code with basis $basis', async ({ code, basis, expected }) => {
    imposeSanction.mockResolvedValue(ok(twoEventWorkspace()));
    const form = await openSanctionForm();
    fireEvent.change(form.getByLabelText('Classification'), { target: { value: code } });
    expect(Boolean(form.queryByLabelText('Authority basis'))).toBe(basis !== null);
    if (basis) fireEvent.change(form.getByLabelText('Authority basis'), { target: { value: basis } });
    fireEvent.change(form.getByLabelText('Source event'), { target: { value: EVENT_MIXED } });
    fillRequired(form);

    fireEvent.click(form.getByRole('button', { name: `Record ${code}` }));
    await waitFor(() => expect(useConfirmDialogStore.getState().isOpen).toBe(true));
    await new Promise((resolve) => setTimeout(resolve, 15));
    const answeredAt = Date.now();
    expect(await answerConfirm(true)).toBe(`Record ${code} for Athlete One and apply its official scope?`);

    expect(await screen.findByText(`${code} recorded. Review the affected results again.`)).toBeInTheDocument();
    expect(imposeSanction).toHaveBeenCalledWith({
      athleteIdentityId: IDENTITY_ONE,
      sourceEventId: EVENT_MIXED,
      classificationCode: code,
      ...expected,
      authorityReference: 'Jury minutes 7',
      officialName: 'Jury Chair',
      ruleReference: 'ISSF 6.12.6',
      publicRemark: 'Disqualified',
      decidedAt: expect.any(String),
    });
    const decidedAt = imposeSanction.mock.calls[0]![0].decidedAt!;
    expect(new Date(decidedAt).toISOString()).toBe(decidedAt);
    expect(Date.parse(decidedAt)).toBeGreaterThanOrEqual(answeredAt);
    expect(screen.queryByRole('heading', { name: /^Record sanction · / })).not.toBeInTheDocument();
  });

  it('sends the optional incident report and internal note when given', async () => {
    imposeSanction.mockResolvedValue(fail('Jury quorum missing'));
    const form = await openSanctionForm();
    fillRequired(form);
    type(form.getByLabelText('Rule reference'), '  ISSF 6.12.7  ');
    type(form.getByLabelText('Incident report (optional)'), '  IR-12  ');
    type(form.getByLabelText('Internal note (optional)'), '  Seen on video  ');

    fireEvent.click(form.getByRole('button', { name: 'Record DSQ' }));
    await answerConfirm(true);

    expect(await screen.findByText('Jury quorum missing')).toHaveAttribute('class', ERROR_CLASS);
    expect(imposeSanction).toHaveBeenCalledWith(
      expect.objectContaining({
        ruleReference: 'ISSF 6.12.7',
        incidentReportNumber: 'IR-12',
        internalNote: 'Seen on video',
      }),
    );
    expect(form.getByLabelText('Authority reference')).toHaveValue('  Jury minutes 7  ');
    expect(form.getByLabelText('Internal note (optional)')).toHaveClass(`${INPUT_CLASSES} min-h-16 resize-y`);
  });

  it('records nothing when the official cancels', async () => {
    const form = await openSanctionForm();
    fillRequired(form);

    fireEvent.click(form.getByRole('button', { name: 'Record DSQ' }));
    await answerConfirm(false);

    expect(imposeSanction).not.toHaveBeenCalled();
    expect(form.getByLabelText('Authority reference')).toHaveValue('  Jury minutes 7  ');
  });

  it('keeps the draft when another identity is chosen and closes on Cancel', async () => {
    const form = await openSanctionForm();
    type(form.getByLabelText('Authority reference'), 'Jury minutes 7');

    fireEvent.click(within(card('Athlete Two')).getByRole('button', { name: 'Record sanction' }));

    expect(screen.getByRole('heading', { name: 'Record sanction · Athlete Two' })).toBeInTheDocument();
    expect(sanctionForm().getByLabelText('Authority reference')).toHaveValue('Jury minutes 7');
    fireEvent.click(sanctionForm().getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('heading', { name: /^Record sanction · / })).not.toBeInTheDocument();
  });
});

describe('AthleteSanctionsPanel revocation', () => {
  const sanctioned = () =>
    workspace({
      activeSanctions: [
        sanction(),
        sanction({
          id: '62222222-2222-4222-8222-222222222222',
          athleteIdentityId: '49999999-9999-4999-8999-999999999999',
          sourceEventId: '29999999-9999-4999-8999-999999999999',
          classificationCode: 'DQB',
          scope: 'CHAMPIONSHIP',
          authorityBasis: 'JURY_MAJORITY',
          officialRole: 'JURY_MEMBER',
          publicRemark: 'Unsporting conduct',
        }),
      ],
    });

  it('lists the active sanctions', async () => {
    await renderPanel(sanctioned());

    const list = within(screen.getByRole('heading', { name: 'Active sanctions' }).closest('section')!);
    expect(list.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'DSQ Athlete OneEVENT · Air Rifle Men · Disqualified for equipment Revoke',
      'DQB 49999999-9999-4999-8999-999999999999CHAMPIONSHIP · 29999999-9999-4999-8999-999999999999 · Unsporting conduct Revoke',
    ]);
  });

  it('revokes with the original authority and clears the reason', async () => {
    revokeSanction.mockResolvedValue(ok(sanctioned()));
    await renderPanel(sanctioned());
    type('Recording official', 'Jury Chair');
    const list = within(screen.getByRole('heading', { name: 'Active sanctions' }).closest('section')!);
    fireEvent.click(list.getAllByRole('button', { name: 'Revoke' })[0]!);
    expect(list.getByLabelText('Revoking official')).toHaveValue('');
    expect(list.getByLabelText('Rule reference')).toHaveValue('ISSF Jury correction');
    expect(list.getByRole('button', { name: 'Confirm revocation' })).toBeDisabled();
    type(list.getByLabelText('Revoking official'), '  Jury Chair  ');
    type(list.getByLabelText('Authority reference'), '  Jury minutes 9  ');
    type(list.getByLabelText('Public revocation reason'), '  Equipment passed on re-check  ');

    fireEvent.click(list.getByRole('button', { name: 'Confirm revocation' }));
    expect(await answerConfirm(true)).toBe('Revoke DSQ for Athlete One?');

    expect(
      await screen.findByText('Sanction revoked. The revocation and original decision remain in the audit history.'),
    ).toBeInTheDocument();
    expect(revokeSanction).toHaveBeenCalledWith({
      decisionId: SANCTION_ONE,
      authorityBasis: 'POST_COMPETITION_CHECK',
      authorityReference: 'Jury minutes 9',
      officialName: 'Jury Chair',
      officialRole: 'EQUIPMENT_CONTROL_JURY',
      ruleReference: 'ISSF Jury correction',
      reason: 'Equipment passed on re-check',
      decidedAt: expect.any(String),
    });
    expect(list.queryByLabelText('Public revocation reason')).not.toBeInTheDocument();
    fireEvent.click(list.getAllByRole('button', { name: 'Revoke' })[0]!);
    expect(list.getByLabelText('Public revocation reason')).toHaveValue('');
    expect(list.getByLabelText('Authority reference')).toHaveValue('  Jury minutes 9  ');
  });

  it('names an unknown athlete in the confirmation and keeps the form on failure', async () => {
    revokeSanction.mockResolvedValue(fail('Decision already revoked'));
    await renderPanel(sanctioned());
    const list = within(screen.getByRole('heading', { name: 'Active sanctions' }).closest('section')!);
    fireEvent.click(list.getAllByRole('button', { name: 'Revoke' })[1]!);
    type(list.getByLabelText('Revoking official'), 'Jury Chair');
    type(list.getByLabelText('Authority reference'), 'Jury minutes 9');
    type(list.getByLabelText('Public revocation reason'), 'Wrong athlete');

    fireEvent.click(list.getByRole('button', { name: 'Confirm revocation' }));
    expect(await answerConfirm(true)).toBe('Revoke DQB for this athlete?');

    expect(await screen.findByText('Decision already revoked')).toHaveAttribute('class', ERROR_CLASS);
    expect(list.getByLabelText('Public revocation reason')).toHaveValue('Wrong athlete');
    fireEvent.click(list.getByRole('button', { name: 'Cancel' }));
    expect(list.queryByLabelText('Public revocation reason')).not.toBeInTheDocument();
  });
});
