// SPDX-License-Identifier: MIT
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { FiringPointAssignmentEditor } from '@/renderer/presentation/features/championship/components/FiringPointAssignmentEditor';
import { ParticipantEditor } from '@/renderer/presentation/features/championship/components/ParticipantEditor';
import type { ParticipantDto } from '@/shared/ipc/contracts/championship.contract';

const participant: ParticipantDto = {
  id: '11111111-1111-4111-8111-111111111111',
  playerName: 'Alex Smith',
  affiliation: 'Tokyo',
  logoPath: null,
  sortOrder: 0,
};

function createDeferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe('championship editor save state', () => {
  it.each(['Firing points', 'Relays'])('preserves all assignments while typing a larger %s count', async (label) => {
    const participants = Array.from({ length: 10 }, (_, index) => ({
      ...participant,
      id: crypto.randomUUID(),
      playerName: `Athlete ${index + 1}`,
      sortOrder: index,
    }));
    const assignments = participants.map((athlete, index) => ({
      id: crypto.randomUUID(),
      relayNumber: label === 'Relays' ? index + 1 : 1,
      firingPointNumber: label === 'Firing points' ? index + 1 : 1,
      participantId: athlete.id,
    }));
    const onSave = vi.fn().mockResolvedValue(true);
    render(<FiringPointAssignmentEditor assignments={assignments} participants={participants} onSave={onSave} />);

    const input = screen.getByRole('textbox', { name: label });
    fireEvent.change(input, { target: { value: '2' } });
    fireEvent.change(input, { target: { value: '20' } });
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    fireEvent.blur(input);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave).toHaveBeenCalledWith(
      assignments.map(({ relayNumber, firingPointNumber, participantId }) => ({
        relayNumber,
        firingPointNumber,
        participantId,
      })),
    );
    expect(input).toHaveValue('20');
  });

  it('cancels incomplete counts and applies a deliberate reduction on Enter', async () => {
    const assignments = [1, 2, 3].map((firingPointNumber) => ({
      id: crypto.randomUUID(),
      relayNumber: 1,
      firingPointNumber,
      participantId: participant.id,
    }));
    const onSave = vi.fn().mockResolvedValue(true);
    render(<FiringPointAssignmentEditor assignments={assignments} participants={[participant]} onSave={onSave} />);
    const input = screen.getByRole('textbox', { name: 'Firing points' });
    for (const value of ['', '0', '2.5', '2abc']) {
      fireEvent.change(input, { target: { value } });
      fireEvent.blur(input);
      expect(input).toHaveValue('3');
      expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    }
    fireEvent.change(input, { target: { value: '1' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.blur(input);
    expect(input).toHaveValue('3');
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: '2' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onSave.mock.calls[0]![0]).toHaveLength(2);
  });

  it('keeps participant edits dirty after a failed save', async () => {
    const onSave = vi.fn().mockResolvedValue(null);
    render(<ParticipantEditor participants={[participant]} onSave={onSave} />);

    fireEvent.change(screen.getByPlaceholderText('Athlete name'), { target: { value: 'Jordan Smith' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(await screen.findByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('keeps firing-point assignment edits dirty after a failed save', async () => {
    const onSave = vi.fn().mockResolvedValue(false);
    render(
      <FiringPointAssignmentEditor
        assignments={[
          {
            id: '22222222-2222-4222-8222-222222222222',
            relayNumber: 1,
            firingPointNumber: 1,
            participantId: participant.id,
          },
        ]}
        participants={[participant]}
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByTitle('Drag to move / click to unassign: Alex Smith'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(await screen.findByRole('button', { name: 'Save' })).toBeEnabled();
  });

  it('does not overwrite participant edits made while a save is pending', async () => {
    const saveCompleted = createDeferred();
    const submittedRows = vi.fn();

    function Harness() {
      const [serverParticipants, setServerParticipants] = useState<ParticipantDto[]>([]);
      return (
        <ParticipantEditor
          participants={serverParticipants}
          onSave={async (rows) => {
            submittedRows(rows);
            await saveCompleted.promise;
            const savedParticipants = [{ ...participant, playerName: rows[0]!.playerName }];
            setServerParticipants(savedParticipants);
            return savedParticipants;
          }}
        />
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Add athlete' }));
    const nameInput = screen.getByPlaceholderText('Athlete name');
    fireEvent.change(nameInput, { target: { value: 'Submitted Name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(submittedRows).toHaveBeenCalledOnce());

    fireEvent.change(nameInput, { target: { value: 'Edit During Save' } });
    await act(async () => saveCompleted.resolve());

    await waitFor(() => expect(screen.getByPlaceholderText('Athlete name')).toHaveValue('Edit During Save'));
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(submittedRows).toHaveBeenCalledTimes(2));
    expect(submittedRows).toHaveBeenLastCalledWith([
      {
        id: participant.id,
        playerName: 'Edit During Save',
        familyName: 'Edit During Save',
        affiliation: '',
        startNumber: null,
        issfId: null,
        nationCode: null,
        gender: 'UNSPECIFIED',
        entryStatus: 'COMPETING',
        teamId: null,
        teamName: null,
      },
    ]);
  });

  it('does not overwrite firing-point assignment edits made while a save is pending', async () => {
    const saveCompleted = createDeferred();
    const submittedRows = vi.fn();
    const initialAssignments = [
      {
        id: '22222222-2222-4222-8222-222222222222',
        relayNumber: 1,
        firingPointNumber: 1,
        participantId: participant.id,
      },
    ];

    function Harness() {
      const [serverAssignments, setServerAssignments] = useState(initialAssignments);
      return (
        <FiringPointAssignmentEditor
          assignments={serverAssignments}
          participants={[participant]}
          onSave={async (rows) => {
            submittedRows(rows);
            await saveCompleted.promise;
            setServerAssignments([]);
            return true;
          }}
        />
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByTitle('Drag to move / click to unassign: Alex Smith'));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(submittedRows).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole('button', { name: 'Increase Firing points:' }));
    await act(async () => saveCompleted.resolve());

    await waitFor(() => expect(screen.getByText('Firing point 2')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled();
  });
});
