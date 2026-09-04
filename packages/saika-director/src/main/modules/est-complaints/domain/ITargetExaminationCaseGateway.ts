import type { CreateTargetExaminationCasePayload, TargetExaminationCaseDto } from '@/shared/ipc/contracts';

/** Narrow downstream boundary; EST complaint handling does not own examination workflow state. */
export interface ITargetExaminationCaseGateway {
  create(input: CreateTargetExaminationCasePayload): TargetExaminationCaseDto;
}
