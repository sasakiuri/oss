import type { MalfunctionScoreSheet } from './MalfunctionScoreSheet';

/** Original print layout; no official form artwork or scripts are embedded. */
export function renderMalfunctionScoreSheetHtml(sheet: MalfunctionScoreSheet): string {
  const { input, context, calculation } = sheet;
  const selected = new Set(calculation.countedShots.flatMap((shot) => (shot.shotId ? [shot.shotId] : [])));
  const rows = [
    ...input.original.map((shot) => ({ row: 'Original', ...shot })),
    ...input.recovery.map((shot) => ({ row: 'Recovery', ...shot })),
  ];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
<title>${escape(calculation.form)} malfunction calculation v${sheet.version}</title>
<style>body{font:12px system-ui,sans-serif;color:#17212b;max-width:1000px;margin:24px auto;padding:0 16px}h1{font-size:22px}h2{font-size:16px}table{border-collapse:collapse;width:100%;margin:12px 0}th,td{border:1px solid #bbc3ca;padding:7px;text-align:left;overflow-wrap:anywhere}thead{display:table-header-group}tr{break-inside:avoid}.metadata{overflow-wrap:anywhere;font-size:11px}th{background:#eef2f6}@page{size:A4;margin:15mm}@media print{body{margin:0;padding:0}}</style>
</head><body><h1>${escape(calculation.form)} malfunction calculation</h1>
<p>Version ${sheet.version} · ${escape(sheet.recordedAt)} · ISSF ${escape(calculation.ruleReference)}</p>
<p>${escape(context.startNumber ?? '')} ${escape(context.athleteName)} · FP ${context.laneChannel} · Stage ${context.stageIndex + 1}, series ${context.seriesIndex + 1}</p>
<p>${escape(calculation.combination)} · Total: <strong>${calculation.totalX10 / 10}</strong></p>
<h2>Original and recovery evidence</h2>
<table><thead><tr><th>Row</th><th>Target</th><th>Score</th><th>Outcome</th><th>Counted</th><th>Evidence</th></tr></thead><tbody>
${rows.map((shot) => `<tr><td>${shot.row}</td><td>${shot.targetIndex === undefined ? '—' : shot.targetIndex + 1}</td><td>${shot.scoreX10 / 10}</td><td>${shot.outcome}</td><td>${selected.has(shot.shotId) ? 'Yes' : 'No'}</td><td>${escape(shot.shotId)}<br>${escape(shot.evidenceReference)}</td></tr>`).join('')}
</tbody></table>
<h2>Counted scores</h2>
<table><thead><tr><th>Target / position</th><th>Source row</th><th>Score</th><th>Basis</th></tr></thead><tbody>
${calculation.countedShots.map((shot, index) => `<tr><td>${shot.targetIndex === null ? index + 1 : shot.targetIndex + 1}</td><td>${shot.row}</td><td>${shot.scoreX10 / 10}</td><td>${shot.addedZero ? 'Rule-added zero' : escape(shot.shotId ?? '')}</td></tr>`).join('')}
</tbody></table>
${input.secondMalfunction ? `<p>Second malfunction: ${escape(input.secondMalfunction.evidenceReference)}. Zero-fill row: ${input.secondMalfunction.zeroFillRow}.</p>` : ''}
<h2>Official evidence confirmation</h2><p>${escape(input.officialName)} (${input.officialRole})</p><p>${escape(input.statement)}</p>
<p>This calculation record supports the official score application. Saving it does not execute firing or change the competition score.</p>
<div class="metadata"><p>Case: ${escape(input.caseId)} · Sheet: ${escape(sheet.id)}</p>
<p>Authorization: ${escape(calculation.authorizationId)} · Execution: ${escape(calculation.executionArtifactId)}</p>
<p>Rule Pack: ${escape(context.rulePackIdentity?.id ?? 'Local policy snapshot')} · ${escape(context.rulePackIdentity?.fingerprint.value ?? '')}</p>
<p>Snapshot SHA-256: ${escape(sheet.digest)}</p></div></body></html>`;
}
function escape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
