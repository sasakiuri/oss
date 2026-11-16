import { defineCommand } from '@/main/shared-infra/cqrs/CommandBus';
import { defineQuery } from '@/main/shared-infra/cqrs/QueryBus';

import type {
  StartShootoffCommand,
  AddShootoffShotCommand,
  CompleteShootoffRoundCommand,
  ResolveShootoffCommand,
} from './commands/ShootoffCommands';

// --- Command Tokens ---
export const StartShootoffToken = defineCommand<StartShootoffCommand, { shootoffId: string }>('StartShootoff');
export const AddShootoffShotToken = defineCommand<AddShootoffShotCommand>('AddShootoffShot');
export const CompleteShootoffRoundToken = defineCommand<CompleteShootoffRoundCommand, unknown>('CompleteShootoffRound');
export const ResolveShootoffToken = defineCommand<ResolveShootoffCommand>('ResolveShootoff');

// --- Query Tokens ---
export const GetActiveShootoffToken = defineQuery<{ eventId: string }, unknown>('GetActiveShootoff');
