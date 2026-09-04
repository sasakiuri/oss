import { TargetExaminationService } from '@/main/modules/target-examinations';
import type { ITargetExaminationRepository } from '@/main/modules/target-examinations';
import type { CreateTargetExaminationCasePayload, TargetExaminationCaseDto } from '@/shared/ipc/contracts';

import type { ITargetExaminationCaseGateway } from '../domain/ITargetExaminationCaseGateway';

export class TargetExaminationCaseGateway implements ITargetExaminationCaseGateway {
  private readonly service: TargetExaminationService;

  constructor(repository: ITargetExaminationRepository) {
    this.service = new TargetExaminationService(repository);
  }

  create(input: CreateTargetExaminationCasePayload): TargetExaminationCaseDto {
    return this.service.createNow(input);
  }
}
