import type {
  ProductionOperationAssessmentDto,
  ProductionOperationEntryDto,
  ProductionOperationScopePayload,
  RecordProductionOperationPayload,
} from '@/shared/ipc/contracts';
import type {
  IProductionOperationRepository,
  ProductionOperationEntry,
} from '../domain/IProductionOperationRepository';
import type { IProductionOperationPolicy } from '../domain/ProductionOperationPolicy';
import { IssfProductionOperationPolicy } from '../domain/ProductionOperationPolicy';

export class ProductionOperationService {
  constructor(
    private readonly repository: IProductionOperationRepository,
    private readonly policy: IProductionOperationPolicy = new IssfProductionOperationPolicy(),
  ) {}

  async list(competitionId: string): Promise<ProductionOperationEntryDto[]> {
    return this.repository.findByCompetition(competitionId);
  }

  async assess(input: ProductionOperationScopePayload): Promise<ProductionOperationAssessmentDto> {
    return this.policy.assess({ ...input, entries: this.repository.findByCompetition(input.competitionId) });
  }

  async record(input: RecordProductionOperationPayload): Promise<ProductionOperationEntryDto> {
    const entry: ProductionOperationEntry = {
      id: crypto.randomUUID(),
      competitionId: input.competitionId,
      competitionTypeId: input.competitionTypeId,
      roundName: input.roundName.trim(),
      phase: input.phase.trim(),
      action: input.action,
      statement: input.statement.trim(),
      officialName: input.officialName.trim(),
      recordedAt: input.recordedAt ?? new Date().toISOString(),
    };
    this.repository.append(entry);
    return entry;
  }
}
