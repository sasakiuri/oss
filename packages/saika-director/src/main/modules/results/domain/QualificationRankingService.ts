import type { ProjectedQualificationResult } from './ProjectedQualificationResult';
import { RankingService } from './RankingService';

/** Keeps a whole uncertain score group provisional, avoiding a non-transitive sort comparator. */
export class QualificationRankingService {
  calculateRankings(results: readonly ProjectedQualificationResult[]) {
    const groups = new Map<number, ProjectedQualificationResult[]>();
    for (const result of results.filter((item) => item.projection.classificationCode === null)) {
      const group = groups.get(result.totalScore) ?? [];
      group.push(result);
      groups.set(result.totalScore, group);
    }
    let offset = 0;
    const ranked = [...groups.entries()]
      .sort(([a], [b]) => b - a)
      .flatMap(([, group]) => {
        const issues = new Set<string>();
        for (let left = 0; left < group.length; left++) {
          for (let right = left + 1; right < group.length; right++) {
            for (const issue of group[left]!.comparisonIssuesAgainst(group[right]!)) issues.add(issue);
          }
        }
        const ordered = issues.size
          ? [...group].sort((a, b) => a.compareEqualForDisplay(b)).map((result) => ({ result, rank: 1 }))
          : new RankingService().calculateRankings(group);
        const values = ordered.map((item) => ({ ...item, rank: item.rank + offset, issues: [...issues] }));
        offset += group.length;
        return values;
      });
    return [
      ...ranked,
      ...results
        .filter((item) => item.projection.classificationCode !== null)
        .map((result) => ({ result, rank: 0, issues: [] as string[] })),
    ];
  }
}
