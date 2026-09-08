// SPDX-License-Identifier: MIT
type Row = Readonly<Record<string, unknown>>;
type Column = readonly [label: string, key: string];

/** Standalone, script-free presentation of an immutable certified snapshot. */
export function renderResultsBookHtml(document: Row): string {
  const championship = row(document.championship);
  const certification = row(document.resultsCertification);
  const version = row(document.publicationVersion);
  const sections: Array<readonly [string, string]> = [
    ['certification', 'Results Certification'],
    ['officials', 'Competition Officials'],
    ['entries', 'Entries by Country'],
    ['schedule', 'Competition Schedule'],
    ['medallists', 'Medallists by Name'],
    ['medals', 'Medals by Country'],
    ['records', 'New and Equalled Records'],
    ['results', 'Final Results'],
  ];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>${escape(championship.name)} — Results Book</title>
<style>
@page { size: A4; margin: 16mm 12mm; }
* { box-sizing: border-box; } body { max-width: 1100px; margin: 36px auto; padding: 0 24px; color: #17212b; font: 14px/1.45 system-ui, sans-serif; }
h1 { margin-bottom: .25em; } h2 { border-bottom: 2px solid #263b51; padding-bottom: .3em; margin-top: 2em; } h3 { margin-top: 1.6em; }
a { color: #193c63; } nav ol { columns: 2; padding-left: 1.5em; } table { width: 100%; border-collapse: collapse; margin: 12px 0 24px; font-size: 12px; }
th { background: #edf2f6; text-align: left; } th, td { border-bottom: 1px solid #ccd4db; padding: 7px 5px; vertical-align: top; overflow-wrap: anywhere; }
td { white-space: pre-wrap; } tr { break-inside: avoid; } thead { display: table-header-group; } h2, h3 { break-after: avoid; }
.muted { color: #526170; } .revision { font-size: 11px; overflow-wrap: anywhere; } .event + .event { break-before: page; }
@media print { body { margin: 0; padding: 0; font-size: 10pt; max-width: none; } table { font-size: 8pt; } a { color: inherit; text-decoration: none; } nav { break-after: page; } }
</style></head><body>
<header><p class="muted">Certified Results Book · Version ${escape(version.number)}</p>
<h1>${escape(championship.name)}</h1><p>${escape(championship.date)} · ${escape(championship.venue)}</p>
<p class="revision">${escape(document.ruleReference)} · Certified ${escape(certification.finalizedAt)}</p></header>
<nav aria-label="Contents"><h2>Contents</h2><ol>${sections.map(([id, name]) => `<li><a href="#${id}">${name}</a></li>`).join('')}</ol></nav>
<section id="certification"><h2>Results Certification</h2>
<p>Certified by ${escape(certification.finalizedBy)} · ${escape(certification.finalizedAt)}</p>
<p>${escape(certification.statement)}</p>
${table(
  rows(certification.signatures).map((signature) => ({
    ...signature,
    method: row(signature.signingEvidence).method ?? 'LEGACY',
    recordedBy: row(signature.signingEvidence).recordedBy ?? '',
    evidenceReference: row(signature.signingEvidence).evidenceReference ?? '',
  })),
  [
    ['Role', 'role'],
    ['Official', 'officialName'],
    ['Statement', 'statement'],
    ['Signed at', 'signedAt'],
    ['Method', 'method'],
    ['Recorded by', 'recordedBy'],
    ['Evidence', 'evidenceReference'],
  ],
)}
<p class="revision">Source revision: ${escape(certification.sourceHash)}<br>Book: ${escape(version.bookId)} · Version ${escape(version.number)}</p></section>
${section('officials', 'Competition Officials', rows(document.competitionOfficials), [
  ['Role', 'role'],
  ['Name', 'officialName'],
  ['Organization', 'organization'],
])}
${section('entries', 'Entries by Country', rows(document.entriesByCountry), [
  ['Nation', 'nationCode'],
  ['Athletes', 'athleteCount'],
  ['Entries', 'entryCount'],
])}
${section('schedule', 'Competition Schedule', rows(document.competitionSchedule), [
  ['Event', 'eventName'],
  ['Type', 'eventType'],
  ['Scheduled start', 'scheduledStartAt'],
])}
${section('medallists', 'Medallists by Name', rows(document.medallistsByName), [
  ['Event', 'eventName'],
  ['Medal', 'medal'],
  ['Athlete / Team', 'name'],
  ['Nation', 'nationCode'],
])}
${section('medals', 'Medals by Country', rows(document.medalsByCountry), [
  ['Nation', 'nationCode'],
  ['Gold', 'gold'],
  ['Silver', 'silver'],
  ['Bronze', 'bronze'],
  ['Total', 'total'],
])}
${section(
  'records',
  'New and Equalled Records',
  rows(document.newAndEqualledRecords).map((record) => ({
    ...record,
    score: typeof record.scoreX10 === 'number' ? record.scoreX10 / 10 : null,
  })),
  [
    ['Record', 'code'],
    ['Event', 'eventName'],
    ['Athlete / Team', 'subjectName'],
    ['Nation', 'nationCode'],
    ['Score', 'score'],
    ['Achieved at', 'achievedAt'],
  ],
)}
<section id="results"><h2>Final Results</h2>${rows(document.finalResults)
    .map(
      (event, index) => `
<article class="event" id="event-${index}"><h3>${escape(event.eventName)} · ${escape(event.scope)}</h3>
${table(
  rows(event.results).map((result) => ({
    ...result,
    rank: typeof result.rank === 'number' && result.rank > 0 ? result.rank : null,
    status:
      result.classificationCode === 'AD_DSQ'
        ? 'AD-DSQ'
        : result.classificationCode || (result.entryStatus === 'COMPETING' ? '' : result.entryStatus),
  })),
  [
    ['Rank', 'rank'],
    ['Bib', 'bibNumber'],
    ['Family name', 'familyName'],
    ['Full name / Team', 'name'],
    ['Nation', 'nationCode'],
    ['Score', 'totalScore'],
    ['Status', 'status'],
    ['Remarks', 'remarks'],
  ],
)}
<p class="revision">Result revision: ${escape(event.snapshotRevision)}<br>Rule Pack: ${escape(event.rulePackId)} · ${escape(event.rulePackFingerprint)}</p></article>`,
    )
    .join('')}</section>
<footer><p class="revision">This document presents certified version ${escape(version.number)}. Later corrections are issued as separate versions. Signature entries record official confirmations; they are not cryptographic signatures.</p></footer>
</body></html>`;
}

function section(id: string, title: string, values: readonly Row[], columns: readonly Column[]): string {
  return `<section id="${id}"><h2>${title}</h2>${table(values, columns)}</section>`;
}

function table(values: readonly Row[], columns: readonly Column[]): string {
  if (!values.length) return '<p class="muted">No entries.</p>';
  return `<table><thead><tr>${columns.map(([label]) => `<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${values.map((value) => `<tr>${columns.map(([, key]) => `<td>${escape(value[key])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}

function row(value: unknown): Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Row) : {};
}
function rows(value: unknown): Row[] {
  return Array.isArray(value) ? value.map(row) : [];
}
function escape(value: unknown): string {
  const text = value === null || value === undefined || value === '' ? '—' : String(value);
  return text.replace(
    /[&<>"']/g,
    (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  );
}
