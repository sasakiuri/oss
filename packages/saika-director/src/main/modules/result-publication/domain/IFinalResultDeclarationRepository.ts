import type { FinalResultDeclaration } from './FinalResultDeclaration';

export interface IFinalResultDeclarationRepository {
  append(declaration: FinalResultDeclaration): void;
  findByEvent(eventId: string): FinalResultDeclaration | null;
}
