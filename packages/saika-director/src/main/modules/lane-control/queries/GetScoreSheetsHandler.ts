import type { ILaneControlRepository } from '../domain/ILaneControlRepository';
import type {
  GetScoreSheetsResponse,
  ScoreSheetDto,
  ScoreSheetShotDto,
} from '@/shared/ipc/contracts/laneControl.contract';

export interface GetScoreSheetsQuery {
  laneIds: string[];
}

export class GetScoreSheetsHandler {
  constructor(private readonly repository: ILaneControlRepository) {}

  async execute(query: GetScoreSheetsQuery): Promise<GetScoreSheetsResponse> {
    const scoreSheets: ScoreSheetDto[] = [];

    for (const laneId of query.laneIds) {
      const lane = this.repository.findById(laneId);
      if (!lane) {
        continue;
      }

      // Convert all match shots to ScoreSheetShotDto
      const allShots: ScoreSheetShotDto[] = lane.matchShots.map((shot) => ({
        shotNumber: shot.shotNumber.value,
        value: shot.score.value,
        integerValue: Math.floor(shot.score.value),
        seriesNumber: shot.seriesNumber,
        disposition: shot.disposition,
      }));

      // Calculate total integer score
      const totalIntegerScore = allShots.reduce((sum, shot) => sum + shot.integerValue, 0);

      const scoreSheet: ScoreSheetDto = {
        laneId: lane.id,
        channel: lane.channel.value,
        relay: lane.relayNumber,
        playerName: lane.player?.name ?? '',
        affiliation: lane.player?.affiliation ?? '',
        allShots,
        seriesScores: lane.seriesScores,
        totalScore: lane.totalScore,
        totalIntegerScore,
      };

      scoreSheets.push(scoreSheet);
    }

    return {
      success: true,
      scoreSheets,
    };
  }
}
