// SPDX-License-Identifier: MIT
import { UserError } from "../errors.ts";
import type { Jev } from "../jev/client.ts";
import { evidenceHash } from "../jev/evidence.ts";
import type { NewsRepository, PostScreening } from "../repository.ts";

import { PostError } from "./errors.ts";
import { isBlockingRelation, isSourceCandidate } from "./policy.ts";

/** Recheck against confirmed posts while this claim excludes other automatic sends. */
export async function screenPost(
  repository: NewsRepository,
  articleId: string,
  jev?: Jev,
): Promise<PostScreening | undefined> {
  const article = await repository.article(articleId);
  if (article.reviewStatus === "approved" && article.reviewedAt)
    return {
      evidenceHash: await evidenceHash(article),
      permitted: true,
      approvedAt: article.reviewedAt,
    };
  if (!jev?.key) return undefined;
  if (isSourceCandidate(article)) return undefined;
  const expectedEvidenceHash = await evidenceHash(article);
  const posted = await repository.postedArticles(article);
  if (!posted.length)
    return { evidenceHash: expectedEvidenceHash, permitted: true };
  const settings = await repository.settings();
  try {
    const result = await jev.relate(article, settings.rubric, posted);
    const blocking = isBlockingRelation(result.relation);
    if (blocking || result.relationProvenance?.length) {
      const related = posted.find(
        (other) => other.id === result.relatedArticleId,
      );
      if (result.relatedArticleId && !related)
        throw new UserError("比較記事が変更されました。再確認してください");
      const saved = await repository.analyzeResult(
        articleId,
        expectedEvidenceHash,
        settings.rubric,
        { ...result, analysisStatus: article.analysisStatus },
        related ? await evidenceHash(related) : undefined,
        "post-screening",
      );
      if (!saved)
        return { evidenceHash: expectedEvidenceHash, permitted: false };
    }
    if (blocking)
      return { evidenceHash: expectedEvidenceHash, permitted: false };
  } catch (error) {
    throw new PostError(
      `投稿前の重複確認に失敗しました。${error instanceof UserError ? error.message : "Jev の応答を確認してください"}`,
    );
  }
  return { evidenceHash: expectedEvidenceHash, permitted: true };
}
