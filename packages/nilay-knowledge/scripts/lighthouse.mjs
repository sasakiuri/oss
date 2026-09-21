// SPDX-License-Identifier: MIT
import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import config from '../lighthouse.config.mjs';

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const metricIds = [
  'first-contentful-paint',
  'largest-contentful-paint',
  'total-blocking-time',
  'cumulative-layout-shift',
  'speed-index',
];

export function parseArguments(args, settings = config) {
  const { values } = parseArgs({
    args,
    options: {
      profile: { type: 'string' },
      page: { type: 'string' },
      runs: { type: 'string' },
      'output-dir': { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  });
  const select = (value, choices, label) => {
    const selected = value === undefined ? Object.keys(choices) : value.split(',');
    if (!selected.length || selected.some((name) => !Object.hasOwn(choices, name)))
      throw new Error(`Unknown ${label}; choose from ${Object.keys(choices).join(', ')}`);
    if (new Set(selected).size !== selected.length) throw new Error(`Duplicate ${label}`);
    return selected;
  };
  const runs = values.runs ?? String(settings.runs);
  if (!/^\d+$/.test(runs) || Number(runs) < 1 || Number(runs) > 10)
    throw new Error('--runs must be an integer from 1 to 10');
  const output = values['output-dir'] ?? '.lighthouse.reports';
  if (!output.trim() || /[\x00-\x1f\x7f]/.test(output))
    throw new Error('--output-dir must be a nonempty directory path');
  return {
    profiles: select(values.profile, settings.profiles, 'profile'),
    pages: select(values.page, settings.pages, 'page'),
    runs: Number(runs),
    outputDirectory: resolve(packageDirectory, output),
    help: values.help ?? false,
  };
}

export function inspectRun(lhr, settings = config) {
  const errors = [];
  if (!lhr) errors.push('Lighthouse returned no result');
  if (lhr?.runtimeError) errors.push(`Runtime error: ${lhr.runtimeError.code}: ${lhr.runtimeError.message}`);
  const scores = Object.fromEntries(
    Object.keys(settings.minimum).map((id) => {
      const score = lhr?.categories?.[id]?.score;
      if (!Number.isFinite(score)) errors.push(`Missing or invalid category score: ${id}`);
      return [id, Number.isFinite(score) ? score : null];
    }),
  );
  for (const [id, minimum] of Object.entries(settings.assertions)) {
    const audit = lhr?.audits?.[id];
    if (!audit) errors.push(`Missing required audit: ${id}`);
    else if (audit.scoreDisplayMode !== 'notApplicable' && (!Number.isFinite(audit.score) || audit.score < minimum))
      errors.push(`Required audit ${id}: ${audit.score} < ${minimum}`);
  }
  const audits = Object.entries(lhr?.audits ?? {}).flatMap(([id, audit]) => {
    if (audit.scoreDisplayMode === 'error' || audit.errorMessage)
      errors.push(`Audit error ${id}: ${audit.errorMessage ?? 'No score available'}`);
    if (!(Number.isFinite(audit.score) && audit.score < 1) && !audit.errorMessage && audit.scoreDisplayMode !== 'error')
      return [];
    return [
      { id, title: audit.title, score: audit.score, displayValue: audit.displayValue, error: audit.errorMessage },
    ];
  });
  return {
    scores,
    metrics: Object.fromEntries(metricIds.map((id) => [id, lhr?.audits?.[id]?.numericValue ?? null])),
    audits,
    errors,
    warnings: lhr?.runWarnings ?? [],
  };
}

export function summarizeRuns(runs, expectedRuns, profile = config.profiles.desktop, settings = config) {
  const errors = runs.flatMap((run, index) => run.errors.map((error) => `Run ${index + 1}: ${error}`));
  const warnings = runs.flatMap((run, index) => (run.warnings ?? []).map((warning) => `Run ${index + 1}: ${warning}`));
  if (runs.length !== expectedRuns) errors.push(`Expected ${expectedRuns} runs, received ${runs.length}`);
  const median = Object.fromEntries(
    Object.entries(settings.minimum).map(([id, minimum]) => {
      const values = runs.map((run) => run.scores[id]);
      if (!values.every(Number.isFinite)) errors.push(`Missing or invalid category score: ${id}`);
      if (values.length !== expectedRuns || !values.every(Number.isFinite)) return [id, null];
      values.sort((a, b) => a - b);
      const middle = Math.floor(values.length / 2);
      const score = values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
      if (score < minimum) {
        const message = `${id}: median ${score} < ${minimum}`;
        if (id === 'performance' && profile.blockingPerformance === false)
          warnings.push(`${message} (reported target; does not block this profile)`);
        else errors.push(message);
      }
      return [id, score];
    }),
  );
  return { median, errors, warnings, passed: errors.length === 0 };
}

async function stopServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.kill('SIGTERM');
  const timer = globalThis.setTimeout(() => child.kill('SIGKILL'), 5000);
  try {
    await exited;
  } finally {
    globalThis.clearTimeout(timer);
  }
}

async function startServer() {
  const child = spawn(
    process.execPath,
    [require.resolve('next/dist/bin/next'), 'start', '--hostname', '127.0.0.1', '--port', '0'],
    { cwd: packageDirectory, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, FORCE_COLOR: '0' } },
  );
  let output = '';
  let url;
  let spawnError;
  const capture = (chunk) => {
    output = (output + chunk.toString()).slice(-16_000);
    url ??= output.match(/http:\/\/127\.0\.0\.1:([1-9]\d*)/)?.[0];
  };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
  child.on('error', (error) => {
    spawnError = error;
  });
  try {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null || child.signalCode !== null)
        throw new Error(`Next.js exited during startup:\n${output}`);
      if (url) {
        try {
          if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok)
            return { url, close: () => stopServer(child), logs: () => output };
        } catch {
          // The listening socket can be announced before the production handler is ready.
        }
      }
      await setTimeout(100);
    }
    throw new Error(`Next.js startup timed out:\n${output}`);
  } catch (error) {
    if (!spawnError) await stopServer(child);
    throw error;
  }
}

const escapeHtml = (value) => value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);

export async function runLighthouse(options) {
  // Fail on unusable output paths and missing production builds before launching anything.
  await mkdir(options.outputDirectory, { recursive: true });
  if (!(await stat(options.outputDirectory)).isDirectory()) throw new Error('Output path must be a directory');
  await access(options.outputDirectory, constants.W_OK);
  const summary = {
    startedAt: new Date().toISOString(),
    options,
    minimum: config.minimum,
    assertions: config.assertions,
    environment: { node: process.version },
    pages: Object.fromEntries(
      options.profiles.flatMap((profile) =>
        options.pages.map((page) => [`${profile}-${page}`, { profile, page, path: config.pages[page], runs: [] }]),
      ),
    ),
    errors: [],
  };
  let browser;
  let server;
  let userDataDirectory;
  let interrupted = false;
  const interrupt = () => {
    interrupted = true;
    void browser?.close().catch(() => {});
  };
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', interrupt);
  try {
    await access(join(packageDirectory, '.next', 'BUILD_ID'), constants.R_OK);
    const [{ chromium }, { default: lighthouse }, { default: desktop }] = await Promise.all([
      import('@playwright/test'),
      import('lighthouse'),
      import('lighthouse/core/config/desktop-config.js'),
    ]);
    server = await startServer();
    summary.url = server.url;
    userDataDirectory = await mkdtemp(join(tmpdir(), 'knowledge-lighthouse-'));
    browser = await chromium.launchPersistentContext(userDataDirectory, { args: ['--remote-debugging-port=0'] });
    summary.environment.browser = browser.browser().version();
    const port = Number((await readFile(join(userDataDirectory, 'DevToolsActivePort'), 'utf8')).split('\n')[0]);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw new Error('Chromium did not expose a valid debugging port');

    for (const [name, page] of Object.entries(summary.pages)) {
      for (let run = 1; run <= options.runs; run++) {
        if (interrupted) throw new Error('Lighthouse interrupted');
        const artifact = `${name}-${run}`;
        let result;
        let failure;
        try {
          result = await lighthouse(
            `${server.url}${page.path}`,
            { port, output: ['html', 'json'], onlyCategories: Object.keys(config.minimum), logLevel: 'error' },
            config.profiles[page.profile].preset === 'desktop' ? desktop : undefined,
          );
        } catch (error) {
          failure = error instanceof Error ? error.message : String(error);
        }
        const inspected = inspectRun(result?.lhr);
        if (failure) inspected.errors.unshift(failure);
        const html = Array.isArray(result?.report) ? result.report[0] : undefined;
        const json = Array.isArray(result?.report) ? result.report[1] : undefined;
        if (typeof html !== 'string' || typeof json !== 'string')
          inspected.errors.push('Lighthouse did not produce both reports');
        await writeFile(
          join(options.outputDirectory, `${artifact}.html`),
          typeof html === 'string'
            ? html
            : `<!doctype html><html lang="en"><meta charset="utf-8"><title>Lighthouse failed</title><h1>Lighthouse failed</h1><pre>${escapeHtml(inspected.errors.join('\n'))}</pre></html>`,
        );
        await writeFile(
          join(options.outputDirectory, `${artifact}.json`),
          typeof json === 'string'
            ? json
            : JSON.stringify({ errors: inspected.errors, lhr: result?.lhr ?? null }, null, 2),
        );
        page.runs.push({ run, reports: { html: `${artifact}.html`, json: `${artifact}.json` }, ...inspected });
        summary.environment.lighthouse = result?.lhr?.lighthouseVersion ?? summary.environment.lighthouse;
        console.log(`${artifact}: ${JSON.stringify(inspected.scores)}`);
        for (const audit of inspected.audits)
          console.log(`  ${audit.id}: ${audit.score}${audit.displayValue ? ` (${audit.displayValue})` : ''}`);
        for (const error of inspected.errors) console.error(`  ${error}`);
      }
    }
  } catch (error) {
    summary.errors.push(error instanceof Error ? error.message : String(error));
  } finally {
    for (const [name, page] of Object.entries(summary.pages)) {
      Object.assign(page, summarizeRuns(page.runs, options.runs, config.profiles[page.profile]));
      console.log(`${name} median: ${JSON.stringify(page.median)}`);
      for (const warning of page.warnings) console.warn(`${name}: ${warning}`);
      for (const error of page.errors) console.error(`${name}: ${error}`);
    }
    for (const error of summary.errors) console.error(error);
    for (const cleanup of [() => browser?.close(), () => server?.close()]) {
      try {
        await cleanup();
      } catch (error) {
        summary.errors.push(`Cleanup failed: ${String(error)}`);
      }
    }
    if (userDataDirectory)
      await rm(userDataDirectory, { recursive: true, force: true }).catch((error) =>
        summary.errors.push(String(error)),
      );
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
    summary.finishedAt = new Date().toISOString();
    summary.passed = summary.errors.length === 0 && Object.values(summary.pages).every((page) => page.passed);
    await writeFile(join(options.outputDirectory, 'summary.json'), JSON.stringify(summary, null, 2));
  }
  return summary;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) {
      console.log(
        'Usage: npm run lhci:run -- [--profile=mobile,desktop] [--page=home,articles,species,getting,news,newsDetail,about] [--runs=3] [--output-dir=.lighthouse.reports]',
      );
      console.log(
        'Requires a production build. Reports use the package directory as the base for relative output paths.',
      );
    } else {
      const summary = await runLighthouse(options);
      if (!summary.passed) process.exitCode = 1;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
