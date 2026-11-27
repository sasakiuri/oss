import { defineCommand } from '@/main/shared-infra/cqrs/CommandBus';
import { defineQuery } from '@/main/shared-infra/cqrs/QueryBus';
import type { GetScoreSheetsResponse } from '@/shared/ipc/contracts';

import type { LaneControl } from '../domain/LaneControl';

import type {
  StartPreparationCommand,
  AdvanceToNextStageCommand,
  StartSeriesCommand,
  FinishCommand,
  ClearCommand,
  AssignPlayersCommand,
  MoveLaneCommand,
  EditShotCommand,
  DeleteShotCommand,
  InsertShotCommand,
  EliminatePlayerCommand,
} from './commands/LaneCommands';
import type { StartLaneShootoffCommand } from './commands/StartLaneShootoffHandler';
import type { AddLaneShootoffShotCommand } from './commands/AddLaneShootoffShotHandler';
import type { ResolveLaneShootoffCommand } from './commands/ResolveLaneShootoffHandler';
import type { LaneControlDto } from './queries/GetAllLaneControlsHandler';
import type { GetScoreSheetsQuery } from './queries/GetScoreSheetsHandler';
import type { GetLaneByIdQuery } from './queries/GetLaneByIdHandler';

// --- Command Tokens ---
export const StartPreparationToken = defineCommand<StartPreparationCommand>('StartPreparation');
export const AdvanceToNextStageToken = defineCommand<AdvanceToNextStageCommand>('AdvanceToNextStage');
export const StartSeriesToken = defineCommand<StartSeriesCommand>('StartSeries');
export const FinishToken = defineCommand<FinishCommand>('Finish');
export const ClearToken = defineCommand<ClearCommand>('Clear');
export const AssignPlayersToken = defineCommand<AssignPlayersCommand>('AssignPlayers');
export const MoveLaneToken = defineCommand<MoveLaneCommand>('MoveLane');
export const EditShotToken = defineCommand<EditShotCommand>('EditShot');
export const DeleteShotToken = defineCommand<DeleteShotCommand>('DeleteShot');
export const InsertShotToken = defineCommand<InsertShotCommand>('InsertShot');
export const EliminatePlayerToken = defineCommand<EliminatePlayerCommand>('EliminatePlayer');
export const StartLaneShootoffToken = defineCommand<StartLaneShootoffCommand>('StartLaneShootoff');
export const AddLaneShootoffShotToken = defineCommand<AddLaneShootoffShotCommand>('AddLaneShootoffShot');
export const ResolveLaneShootoffToken = defineCommand<ResolveLaneShootoffCommand>('ResolveLaneShootoff');

// --- Query Tokens ---
export const GetScoreSheetsToken = defineQuery<GetScoreSheetsQuery, GetScoreSheetsResponse>('GetScoreSheets');
export const GetAllLaneControlsToken = defineQuery<unknown, LaneControlDto[]>('GetAllLaneControls');
export const GetLaneByIdToken = defineQuery<GetLaneByIdQuery, LaneControl | undefined>('GetLaneById');
export const GetAllLanesToken = defineQuery<unknown, LaneControl[]>('GetAllLanes');
