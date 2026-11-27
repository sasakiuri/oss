// SPDX-License-Identifier: MIT
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';

import { qualityReports } from './lib/artifact.mjs';

let body = '# Saika Docs validation\n\n';
for (const [title, file] of [
  ['Coverage', qualityReports.coverage],
  ['Lighthouse', qualityReports.lighthouse],
  ['Distribution', 'dist/docs/manifest.json'],
]) {
  try {
    const value = JSON.parse(await readFile(file, 'utf8'));
    body += `## ${title}\n\n\`\`\`json\n${JSON.stringify(value.total ?? value, null, 2)}\n\`\`\`\n\n`;
  } catch {
    body += `${title}: no report was produced; inspect the corresponding job result.\n\n`;
  }
}
await mkdir('reports', { recursive: true });
await writeFile('reports/summary.md', body);
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, body);
