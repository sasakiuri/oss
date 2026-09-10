// SPDX-License-Identifier: MIT
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const update = process.argv.includes('--update-baseline');
const files = process.argv.slice(2).filter((arg) => arg !== '--update-baseline');
const result = spawnSync(
  process.execPath,
  [
    path.join(path.dirname(require.resolve('textlint/package.json')), 'bin/textlint.js'),
    '--format',
    'json',
    ...(files.length ? files : ['**/*.{md,txt}']),
  ],
  { encoding: 'utf8', maxBuffer: 30_000_000 },
);
if (result.error || ![0, 1].includes(result.status))
  throw new Error(result.stderr || String(result.error || 'Textlint failed'));
let reports;
try {
  reports = JSON.parse(result.stdout);
} catch {
  throw new Error(`Textlint did not produce a JSON report: ${result.stderr}`);
}
const counts = {};
const details = new Map();
for (const report of reports) {
  if (report.messages.length === 0) continue;
  const file = path.relative(process.cwd(), report.filePath).split(path.sep).join('/');
  const lines = (await readFile(report.filePath, 'utf8')).split('\n');
  for (const message of report.messages) {
    const key = createHash('sha256')
      .update(JSON.stringify([file, message.ruleId, message.message, lines[message.line - 1]?.trim()]))
      .digest('hex');
    counts[key] = (counts[key] ?? 0) + 1;
    details.set(key, { file, line: message.line, rule: message.ruleId, message: message.message });
  }
}
const baselinePath = '.textlint-baseline.json';
if (update) {
  await writeFile(
    baselinePath,
    JSON.stringify(
      {
        explanation:
          'Reviewed adoption baseline; only pre-existing exact line/rule/message combinations are accepted. Do not update in CI.',
        counts,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    `Recorded ${Object.values(counts).reduce((a, b) => a + b, 0)} existing findings. Review baseline changes before committing.`,
  );
} else {
  const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
  let added = 0;
  for (const [key, count] of Object.entries(counts))
    if (count > (baseline.counts[key] ?? 0)) {
      console.error(details.get(key));
      added += count - (baseline.counts[key] ?? 0);
    }
  console.log(
    `Textlint: ${added} new findings; ${Object.values(counts).reduce((a, b) => a + b, 0)} existing findings. Strict mode reports all findings.`,
  );
  process.exitCode = added ? 1 : 0;
}
