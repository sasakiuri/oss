// SPDX-License-Identifier: MIT
import { CommandAcknowledgementSchema as CommandAckPayloadSchema } from '@sasakiuri/saika-protocol/Acknowledgement';
import { createCommandSchemas } from '@sasakiuri/saika-protocol/commands';
import { z } from 'zod';

export { CommandAckPayloadSchema };

// Preserve compatibility with legacy Lane senders that omitted the human-readable issuer label.
export const {
  CommandBaseSchema,
  ReserveLaneTransferCommandSchema: ReserveLaneTransferCmdSchema,
  JoinCompetitionCommandSchema: JoinCompetitionCmdSchema,
  LeaveCompetitionCommandSchema: LeaveCompetitionCmdSchema,
  ProbeClockCommandSchema: ProbeClockCmdSchema,
  ActivateSafetyStopCommandSchema: ActivateSafetyStopCmdSchema,
  ClearSafetyStopCommandSchema: ClearSafetyStopCmdSchema,
  StartSightingCommandSchema: StartSightingCmdSchema,
  EndSightingCommandSchema: EndSightingCmdSchema,
  StartMatchCommandSchema: StartMatchCmdSchema,
  TimerStartedCommandSchema: TimerStartedCmdSchema,
  TimerExpiredCommandSchema: TimerExpiredCmdSchema,
  AdvanceSeriesCommandSchema: AdvanceSeriesCmdSchema,
  FinishCompetitionCommandSchema: FinishCompetitionCmdSchema,
  AssignAthleteCommandSchema: AssignAthleteCmdSchema,
  StartMalfunctionFiringCommandSchema: StartMalfunctionFiringCmdSchema,
  ReadMalfunctionFiringCommandSchema: ReadMalfunctionFiringCmdSchema,
  CancelMalfunctionFiringCommandSchema: CancelMalfunctionFiringCmdSchema,
  ResetSessionCommandSchema: ResetSessionCmdSchema,
  PauseTimerCommandSchema: PauseTimerCmdSchema,
  ResumeTimerCommandSchema: ResumeTimerCmdSchema,
  ResumeMatchCommandSchema: ResumeMatchCmdSchema,
  StartQualificationRecoveryCommandSchema: StartQualificationRecoveryCmdSchema,
  CancelQualificationRecoveryCommandSchema: CancelQualificationRecoveryCmdSchema,
  ApplyQualificationRecoveryCommandSchema: ApplyQualificationRecoveryCmdSchema,
  SettleQualificationRecoveryCommandSchema: SettleQualificationRecoveryCmdSchema,
  RetireFinalistCommandSchema: RetireFinalistCmdSchema,
  StartShootOffCommandSchema: StartShootOffCmdSchema,
  StopShootOffCommandSchema: StopShootOffCmdSchema,
  StartTimedTargetCommandSchema: StartTimedTargetCmdSchema,
  RecordTimedTargetUnloadCommandSchema: RecordTimedTargetUnloadCmdSchema,
  CancelTimedTargetCommandSchema: CancelTimedTargetCmdSchema,
} = createCommandSchemas(z.string());

export type CommandBase = z.infer<typeof CommandBaseSchema>;
export type JoinCompetitionCmd = z.infer<typeof JoinCompetitionCmdSchema>;
export type LeaveCompetitionCmd = z.infer<typeof LeaveCompetitionCmdSchema>;
export type ProbeClockCmd = z.infer<typeof ProbeClockCmdSchema>;
export type ActivateSafetyStopCmd = z.infer<typeof ActivateSafetyStopCmdSchema>;
export type ClearSafetyStopCmd = z.infer<typeof ClearSafetyStopCmdSchema>;
export type StartSightingCmd = z.infer<typeof StartSightingCmdSchema>;
export type EndSightingCmd = z.infer<typeof EndSightingCmdSchema>;
export type StartMatchCmd = z.infer<typeof StartMatchCmdSchema>;
export type TimerStartedCmd = z.infer<typeof TimerStartedCmdSchema>;
export type TimerExpiredCmd = z.infer<typeof TimerExpiredCmdSchema>;
export type AdvanceSeriesCmd = z.infer<typeof AdvanceSeriesCmdSchema>;
export type FinishCompetitionCmd = z.infer<typeof FinishCompetitionCmdSchema>;
export type AssignAthleteCmd = z.infer<typeof AssignAthleteCmdSchema>;
export type ResetSessionCmd = z.infer<typeof ResetSessionCmdSchema>;
export type PauseTimerCmd = z.infer<typeof PauseTimerCmdSchema>;
export type ResumeTimerCmd = z.infer<typeof ResumeTimerCmdSchema>;
export type ResumeMatchCmd = z.infer<typeof ResumeMatchCmdSchema>;
export type StartQualificationRecoveryCmd = z.infer<typeof StartQualificationRecoveryCmdSchema>;
export type CancelQualificationRecoveryCmd = z.infer<typeof CancelQualificationRecoveryCmdSchema>;
export type ApplyQualificationRecoveryCmd = z.infer<typeof ApplyQualificationRecoveryCmdSchema>;
export type SettleQualificationRecoveryCmd = z.infer<typeof SettleQualificationRecoveryCmdSchema>;
export type RetireFinalistCmd = z.infer<typeof RetireFinalistCmdSchema>;
export type StartShootOffCmd = z.infer<typeof StartShootOffCmdSchema>;
export type StopShootOffCmd = z.infer<typeof StopShootOffCmdSchema>;
export type StartTimedTargetCmd = z.infer<typeof StartTimedTargetCmdSchema>;
export type CancelTimedTargetCmd = z.infer<typeof CancelTimedTargetCmdSchema>;
export type CommandAckPayload = z.infer<typeof CommandAckPayloadSchema>;
