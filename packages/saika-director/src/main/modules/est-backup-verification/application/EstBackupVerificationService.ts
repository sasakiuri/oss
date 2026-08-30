import { createHash } from 'node:crypto';
import type { IParticipantRepository } from '@/main/modules/championship';
import type { IQualificationResultsReader } from '@/main/modules/results';
import type {
  ITeamResultVerificationReadiness,
  TeamResultVerificationKind,
  TeamResultVerificationReadiness,
  TeamResultVerificationReadinessRequest,
} from '@/main/modules/result-verification';
import type {
  CreateEstBackupVerificationPayload,
  EstBackupVerificationRunDto,
  TeamResultDto,
  TeamResultFormatDto,
} from '@/shared/ipc/contracts';
import { compareEstBackup, type OfficialBackupSubject } from '../domain/EstBackupComparator';
import type { IEstBackupVerificationRepository } from '../domain/IEstBackupVerificationRepository';

const ISSF_TEAM_RESULTS_TO_VERIFY = 3;

export interface TeamQualificationResultsReader {
  getQualification(eventId: string, format: TeamResultFormatDto): Promise<TeamResultDto[]>;
}

export class EstBackupVerificationService implements ITeamResultVerificationReadiness {
  constructor(
    private readonly repository: IEstBackupVerificationRepository,
    private readonly participants: Pick<IParticipantRepository, 'findByEventId'>,
    private readonly qualificationResults: IQualificationResultsReader,
    private readonly teamResults: TeamQualificationResultsReader,
  ) {}

  async list(eventId: string): Promise<EstBackupVerificationRunDto[]> {
    return this.repository.findByEvent(eventId);
  }

  async verify(input: CreateEstBackupVerificationPayload): Promise<EstBackupVerificationRunDto> {
    const official =
      input.resultKind === 'INDIVIDUAL'
        ? await this.individualSubjects(input.eventId, input.keyType)
        : await this.teamSubjects(input.eventId, input.resultKind, input.keyType);
    const items = compareEstBackup(official, input.records);
    const interventionsPresent = official.some((subject) => subject.interventionCount > 0);
    const interventionReviewStatement = input.interventionReviewStatement?.trim() || null;
    const comparedOfficialItems = items.filter((item) => item.officialRank !== null);
    const run: EstBackupVerificationRunDto = {
      id: input.id ?? crypto.randomUUID(),
      eventId: input.eventId,
      resultKind: input.resultKind,
      keyType: input.keyType,
      sourceName: input.sourceName.trim(),
      sourceReference: input.sourceReference?.trim() || null,
      items,
      snapshotRevision: calculateSubjectRevision(official),
      interventionReviewStatement,
      verified:
        comparedOfficialItems.length === official.length &&
        comparedOfficialItems.every((item) => item.status === 'MATCH') &&
        (!interventionsPresent || interventionReviewStatement !== null),
      officialName: input.officialName.trim(),
      verifiedAt: input.verifiedAt ?? new Date().toISOString(),
    };
    this.repository.append(run, input.records);
    return run;
  }

  async assess(request: TeamResultVerificationReadinessRequest): Promise<TeamResultVerificationReadiness> {
    if (!Number.isInteger(request.configuredChecks) || request.configuredChecks < 0) {
      throw new Error('configuredChecks must be a non-negative integer');
    }
    if (request.configuredChecks === 0) {
      return {
        supported: true,
        configuredChecks: 0,
        requiredChecks: 0,
        checkedResults: 0,
        snapshotRevision: null,
        currentVerificationId: null,
        issues: [],
      };
    }

    const snapshot = await this.teamSnapshot(request.eventId, request.resultKind);
    const requiredTeams = snapshot.teams.slice(0, request.configuredChecks);
    const requiredChecks = requiredTeams.length;
    const snapshotRevision = snapshot.subjects.length > 0 ? calculateSubjectRevision(snapshot.subjects) : null;
    const issues: string[] = [];
    const supported = request.configuredChecks <= ISSF_TEAM_RESULTS_TO_VERIFY;

    if (!supported) {
      issues.push(
        `The EST backup adapter supports at most ${ISSF_TEAM_RESULTS_TO_VERIFY} team results; ${request.configuredChecks} are configured`,
      );
    }
    if (request.requireResults && requiredChecks === 0) {
      issues.push(`No eligible ${teamResultLabel(request.resultKind)} results are available for verification`);
    }
    if (requiredTeams.some((team) => team.unresolvedTie)) {
      issues.push('A required team result has an unresolved ranking tie');
    }
    if (requiredTeams.some((team) => team.issues.length > 0)) {
      issues.push('A required team result has unresolved projection issues');
    }

    const latestCurrentRun =
      snapshotRevision === null
        ? null
        : (this.repository
            .findByEvent(request.eventId)
            .filter((run) => run.resultKind === request.resultKind && run.snapshotRevision === snapshotRevision)
            .at(-1) ?? null);
    const checkedResults = latestCurrentRun?.verified
      ? Math.min(
          requiredChecks,
          latestCurrentRun.items.filter((item) => item.officialRank !== null && item.status === 'MATCH').length,
        )
      : 0;

    if (requiredChecks > 0 && !latestCurrentRun) {
      issues.push('Required team results need a current EST printout or independent-memory comparison');
    } else if (requiredChecks > 0 && !latestCurrentRun?.verified) {
      issues.push(
        'The latest EST printout or independent-memory comparison for the current team results is not verified',
      );
    }

    return {
      supported,
      configuredChecks: request.configuredChecks,
      requiredChecks,
      checkedResults,
      snapshotRevision,
      currentVerificationId: latestCurrentRun?.verified ? latestCurrentRun.id : null,
      issues,
    };
  }

  private async individualSubjects(
    eventId: string,
    keyType: CreateEstBackupVerificationPayload['keyType'],
  ): Promise<OfficialBackupSubject[]> {
    if (keyType === 'TEAM_ID') throw new Error('Individual backup verification cannot use TEAM_ID');
    const participants = new Map(this.participants.findByEventId(eventId).map((item) => [item.id.value, item]));
    return (await this.qualificationResults.getByEvent(eventId))
      .filter((result) => result.rank > 0 && result.rank <= 10)
      .sort((a, b) => a.rank - b.rank)
      .map((result) => {
        const participant = participants.get(result.participantId);
        if (!participant) throw new Error(`Participant ${result.participantId} was not found`);
        const key =
          keyType === 'PARTICIPANT_ID'
            ? participant.id.value
            : keyType === 'START_NUMBER'
              ? participant.officialEntry.startNumber
              : participant.officialEntry.issfId;
        if (!key) throw new Error(`${result.playerName} has no ${keyType} for backup comparison`);
        return {
          key,
          name: result.playerName,
          rank: result.rank,
          totalScore: result.totalScore,
          interventionCount: result.decisionCount,
        };
      });
  }

  private async teamSubjects(
    eventId: string,
    resultKind: 'TEAM' | 'MIXED_TEAM',
    keyType: CreateEstBackupVerificationPayload['keyType'],
  ): Promise<OfficialBackupSubject[]> {
    if (keyType !== 'TEAM_ID') throw new Error('Team backup verification must use TEAM_ID');
    return (await this.teamSnapshot(eventId, resultKind)).subjects;
  }

  private async teamSnapshot(
    eventId: string,
    resultKind: TeamResultVerificationKind,
  ): Promise<{ teams: TeamResultDto[]; subjects: OfficialBackupSubject[] }> {
    const teams = (
      await this.teamResults.getQualification(eventId, resultKind === 'MIXED_TEAM' ? 'MIXED_PAIR' : 'THREE_MEMBER')
    )
      .filter((team) => team.eligible && team.rank > 0)
      .sort((left, right) => left.rank - right.rank)
      .slice(0, ISSF_TEAM_RESULTS_TO_VERIFY);
    return {
      teams,
      subjects: teams.map((team) => ({
        key: team.teamId,
        name: team.teamName,
        rank: team.rank,
        totalScore: team.totalScore,
        interventionCount: team.members.reduce((sum, member) => sum + member.decisionCount, 0),
      })),
    };
  }
}

function calculateSubjectRevision(subjects: readonly OfficialBackupSubject[]): string {
  return createHash('sha256').update(JSON.stringify(subjects)).digest('hex');
}

function teamResultLabel(kind: TeamResultVerificationKind): string {
  return kind === 'MIXED_TEAM' ? 'Mixed Team' : 'three-member Team';
}
