import { defineModule, type ModuleOutput } from '@/main/shared-infra/module/ModuleDefinition';

// Command handlers
import { StartPreparationHandler } from './application/commands/StartPreparationHandler';
import { AdvanceToNextStageHandler } from './application/commands/AdvanceToNextStageHandler';
import { StartSeriesHandler } from './application/commands/StartSeriesHandler';
import { FinishHandler } from './application/commands/FinishHandler';
import { ClearLanesHandler } from './application/commands/ClearLanesHandler';
import { AssignPlayersHandler } from './application/commands/AssignPlayersHandler';
import { MoveLaneHandler } from './application/commands/MoveLaneHandler';
import { EditShotHandler } from './application/commands/EditShotHandler';
import { DeleteShotHandler } from './application/commands/DeleteShotHandler';
import { InsertShotHandler } from './application/commands/InsertShotHandler';
import { EliminatePlayerHandler } from './application/commands/EliminatePlayerHandler';
import { StartLaneShootoffHandler } from './application/commands/StartLaneShootoffHandler';
import { AddLaneShootoffShotHandler } from './application/commands/AddLaneShootoffShotHandler';
import { ResolveLaneShootoffHandler } from './application/commands/ResolveLaneShootoffHandler';

// Query handlers
import { GetScoreSheetsHandler } from './application/queries/GetScoreSheetsHandler';
import { GetAllLaneControlsHandler } from './application/queries/GetAllLaneControlsHandler';
import { GetLaneByIdHandler } from './application/queries/GetLaneByIdHandler';
import { GetAllLanesHandler } from './application/queries/GetAllLanesHandler';

// IPC Contracts
import { laneControlContract, eventsContract } from '@/shared/ipc/contracts';

// Event listeners and forwarding
import { LaneConnectedHandler } from './application/LaneConnectedHandler';
import { LaneControlUpdatedTransformer } from './application/LaneControlUpdatedTransformer';

// Tokens
import {
  StartPreparationToken,
  AdvanceToNextStageToken,
  StartSeriesToken,
  FinishToken,
  ClearToken,
  AssignPlayersToken,
  MoveLaneToken,
  EditShotToken,
  DeleteShotToken,
  InsertShotToken,
  EliminatePlayerToken,
  StartLaneShootoffToken,
  AddLaneShootoffShotToken,
  ResolveLaneShootoffToken,
  GetAllLaneControlsToken,
  GetScoreSheetsToken,
  GetLaneByIdToken,
  GetAllLanesToken,
} from './application/tokens';

export const laneControlModule = defineModule({
  name: 'lane-control',
  deps: [
    'laneControlRepository',
    'eventBus',
    'commandBus',
    'queryBus',
    'competitionTypeRegistry',
    'ipcRouter',
    'laneTimerService',
    'participantEligibilityReader',
  ],
  register(ctx): ModuleOutput {
    const {
      laneControlRepository,
      eventBus,
      commandBus,
      queryBus,
      competitionTypeRegistry,
      ipcRouter,
      laneTimerService,
      participantEligibilityReader,
    } = ctx;

    // === Command Handlers ===
    const startPrep = new StartPreparationHandler(laneControlRepository, eventBus);
    const advanceStage = new AdvanceToNextStageHandler(laneControlRepository, eventBus);
    const startSeries = new StartSeriesHandler(laneControlRepository, eventBus);
    const finish = new FinishHandler(laneControlRepository, eventBus);
    const clear = new ClearLanesHandler(laneControlRepository, eventBus);
    const assignPlayers = new AssignPlayersHandler(
      laneControlRepository,
      eventBus,
      competitionTypeRegistry,
      participantEligibilityReader,
    );
    const moveLane = new MoveLaneHandler(laneControlRepository, eventBus);
    const editShot = new EditShotHandler(laneControlRepository, eventBus);
    const deleteShot = new DeleteShotHandler(laneControlRepository, eventBus);
    const insertShot = new InsertShotHandler(laneControlRepository, eventBus);
    const eliminatePlayer = new EliminatePlayerHandler(laneControlRepository, eventBus);
    const startLaneShootoff = new StartLaneShootoffHandler(laneControlRepository, eventBus);
    const addLaneShootoffShot = new AddLaneShootoffShotHandler(laneControlRepository, eventBus);
    const resolveLaneShootoff = new ResolveLaneShootoffHandler(laneControlRepository, eventBus);

    commandBus.register(StartPreparationToken, (input) => startPrep.execute(input));
    commandBus.register(AdvanceToNextStageToken, (input) => advanceStage.execute(input));
    commandBus.register(StartSeriesToken, (input) => startSeries.execute(input));
    commandBus.register(FinishToken, (input) => finish.execute(input));
    commandBus.register(ClearToken, (input) => clear.execute(input));
    commandBus.register(AssignPlayersToken, (input) => assignPlayers.execute(input));
    commandBus.register(MoveLaneToken, (input) => moveLane.execute(input));
    commandBus.register(EditShotToken, (input) => editShot.execute(input));
    commandBus.register(DeleteShotToken, (input) => deleteShot.execute(input));
    commandBus.register(InsertShotToken, (input) => insertShot.execute(input));
    commandBus.register(EliminatePlayerToken, (input) => eliminatePlayer.execute(input));
    commandBus.register(StartLaneShootoffToken, (input) => startLaneShootoff.execute(input));
    commandBus.register(AddLaneShootoffShotToken, (input) => addLaneShootoffShot.execute(input));
    commandBus.register(ResolveLaneShootoffToken, (input) => resolveLaneShootoff.execute(input));

    // === Query Handlers ===
    const getScoreSheets = new GetScoreSheetsHandler(laneControlRepository);
    const getAllLaneControls = new GetAllLaneControlsHandler(laneControlRepository);
    const getLaneById = new GetLaneByIdHandler(laneControlRepository);
    const getAllLanes = new GetAllLanesHandler(laneControlRepository);

    queryBus.register(GetScoreSheetsToken, async (input) => getScoreSheets.execute(input));
    queryBus.register(GetAllLaneControlsToken, async () => getAllLaneControls.execute());
    queryBus.register(GetLaneByIdToken, async (input) => getLaneById.execute(input));
    queryBus.register(GetAllLanesToken, async () => getAllLanes.execute());

    // === IPC Registration: Lane Control ===
    ipcRouter.register(laneControlContract, {
      getAll: () => queryBus.execute(GetAllLaneControlsToken, {}),
      startPreparation: (input) => commandBus.execute(StartPreparationToken, input),
      advanceStage: (input) => commandBus.execute(AdvanceToNextStageToken, input),
      startSeries: (input) => commandBus.execute(StartSeriesToken, input),
      finish: (input) => commandBus.execute(FinishToken, input),
      clear: (input) => commandBus.execute(ClearToken, input),
      assignPlayers: (input) => commandBus.execute(AssignPlayersToken, input),
      moveLane: (input) => commandBus.execute(MoveLaneToken, input),
      editShot: (input) => commandBus.execute(EditShotToken, input),
      deleteShot: (input) => commandBus.execute(DeleteShotToken, input),
      insertShot: (input) => commandBus.execute(InsertShotToken, input),
      eliminate: (input) => commandBus.execute(EliminatePlayerToken, input),
      getScoreSheets: (input) => queryBus.execute(GetScoreSheetsToken, input),
    });

    // === Domain Event Listeners ===

    eventBus.on('LanePhaseChanged', (event) => {
      if (event.phase === 'ACTIVE') {
        laneTimerService.startTimer(event.laneId);
      }
    });

    eventBus.on('LaneMoved', (event) => {
      laneTimerService.stopTimer(event.fromLaneId);
      const targetLane = laneControlRepository.findById(event.toLaneId);
      if (targetLane && targetLane.phase === 'ACTIVE') {
        laneTimerService.startTimer(event.toLaneId);
      }
    });

    const laneConnected = new LaneConnectedHandler(laneControlRepository, eventBus);
    eventBus.on('LaneConnected', (event) => laneConnected.handle(event));

    return {
      eventForwarding: [
        {
          eventType: 'LaneControlUpdated',
          transformer: new LaneControlUpdatedTransformer(),
        },
        {
          eventType: 'LaneTimerTick',
          channel: eventsContract.channels.laneTimerTick,
          extractPayload: (e) => ({
            laneId: e.laneId,
            remainingTime: e.remainingTime,
            phase: e.phase,
          }),
        },
        {
          eventType: 'LaneTimerExpired',
          channel: eventsContract.channels.laneTimerExpired,
          extractPayload: (e) => ({
            laneId: e.laneId,
            phase: e.phase,
          }),
        },
      ],
    };
  },
});
