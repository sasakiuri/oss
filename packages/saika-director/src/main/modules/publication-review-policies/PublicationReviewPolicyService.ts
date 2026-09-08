import { createHash } from 'node:crypto';
import { OfficialSigningPolicy, type IOfficialSigningPolicy } from '@/main/modules/official-signing';
import {
  publicationReviewPolicyEntrySchema,
  type PublicationReviewPolicyEntry,
  type PublicationReviewPolicyStatus,
  type SavePublicationReviewPolicy,
} from '@/shared/ipc/contracts/publicationReviewPolicy.contract';
import type { ResultPublicationReviewSettingsDto } from '@/shared/ipc/contracts';

type Scope = 'QUALIFICATION' | 'FINAL';
export interface IPublicationReviewPolicyRepository {
  find(eventId: string, scope: Scope): PublicationReviewPolicyEntry[];
  append(entry: PublicationReviewPolicyEntry, expectedPreviousId: string | null): void;
}

/** Optional event policy; owns neither application defaults nor scoring and publication workflows. */
export class PublicationReviewPolicyService {
  constructor(
    private readonly repository: IPublicationReviewPolicyRepository,
    private readonly readDefaults: () => ResultPublicationReviewSettingsDto,
    private readonly canEdit: (eventId: string, scope: Scope) => boolean,
    private readonly signing: IOfficialSigningPolicy = new OfficialSigningPolicy(),
    private readonly now: () => Date = () => new Date(),
  ) {}

  get(eventId: string, resultScope: Scope): PublicationReviewPolicyStatus {
    const history = this.repository.find(eventId, resultScope);
    const entry = history.at(-1);
    const defaults = { ...this.readDefaults() };
    const effectiveSettings = { ...(entry?.mode === 'PINNED' ? entry.settings : defaults) };
    return {
      eventId,
      resultScope,
      mode: entry?.mode ?? 'INHERIT',
      defaults,
      effectiveSettings,
      revision: digest({
        eventId,
        resultScope,
        entryId: entry?.id ?? null,
        settings: ordered(effectiveSettings),
        // A switch back to shared defaults must use the defaults the operator actually saw.
        defaults: ordered(defaults),
      }),
      editable: this.canEdit(eventId, resultScope),
      history,
    };
  }

  /** Legacy events keep their original approval digest until an event policy is explicitly recorded. */
  approvalRevision(eventId: string, scope: Scope): string | null {
    const entry = this.repository.find(eventId, scope).at(-1);
    // Following shared defaults preserves their existing live-readiness semantics.
    // Only a deliberate event-policy edit invalidates list approval.
    return entry ? digest({ eventId, scope, entryId: entry.id, settings: ordered(entry.settings) }) : null;
  }

  save(input: SavePublicationReviewPolicy): PublicationReviewPolicyStatus {
    const current = this.get(input.eventId, input.resultScope);
    if (!current.editable)
      throw new Error('Event policies cannot change after official publication or Final declaration');
    if (current.revision !== input.expectedRevision)
      throw new Error('The policy or application defaults changed; reload before saving');
    const settings = input.mode === 'PINNED' ? input.settings : current.defaults;
    if (
      current.history.length &&
      current.mode === input.mode &&
      digest(ordered(settings)) === digest(ordered(current.effectiveSettings))
    )
      throw new Error('The event policy has no changes');
    const signingEvidence = this.signing.authorize({ officialName: input.officialName, requiredRole: 'RTS_JURY' });
    const entry = publicationReviewPolicyEntrySchema.parse({
      id: crypto.randomUUID(),
      eventId: input.eventId,
      resultScope: input.resultScope,
      mode: input.mode,
      settings,
      reason: input.reason,
      signingEvidence,
      recordedAt: this.now().toISOString(),
    });
    this.repository.append(entry, current.history.at(-1)?.id ?? null);
    return this.get(input.eventId, input.resultScope);
  }
}

function ordered(value: ResultPublicationReviewSettingsDto) {
  return Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
}
function digest(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
