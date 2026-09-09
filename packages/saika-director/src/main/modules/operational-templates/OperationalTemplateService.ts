import { randomUUID } from 'node:crypto';

import {
  OperationalTemplateSchema,
  RemoveOperationalTemplateSchema,
  SaveOperationalTemplateSchema,
  type OperationalTemplateDto,
  type SaveOperationalTemplateInput,
} from '@/shared/ipc/contracts/operationalTemplates.contract';

export interface IOperationalTemplateRepository {
  list(): OperationalTemplateDto[];
  save(template: OperationalTemplateDto, expectedRevision: number): void;
  remove(id: string, expectedRevision: number): void;
}

/** Stores reusable choices; has no access to competitions, devices or active operational settings. */
export class OperationalTemplateService {
  constructor(
    private readonly repository: IOperationalTemplateRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  list() {
    return this.repository.list();
  }

  save(input: SaveOperationalTemplateInput): OperationalTemplateDto {
    const data = SaveOperationalTemplateSchema.parse(input);
    const template = OperationalTemplateSchema.parse({
      id: data.id ?? randomUUID(),
      name: data.name,
      description: data.description,
      modes: data.modes,
      revision: data.expectedRevision + 1,
      updatedAt: this.now().toISOString(),
    });
    this.repository.save(template, data.expectedRevision);
    return template;
  }

  remove(input: { id: string; expectedRevision: number }): void {
    const data = RemoveOperationalTemplateSchema.parse(input);
    this.repository.remove(data.id, data.expectedRevision);
  }
}
