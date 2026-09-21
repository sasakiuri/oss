// SPDX-License-Identifier: MIT
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { test } from 'node:test';

import config from '../lighthouse.config.mjs';

import { inspectRun, parseArguments, runLighthouse, summarizeRuns } from './lighthouse.mjs';

function report(performance = 0.97) {
  return {
    categories: Object.fromEntries(
      Object.keys(config.minimum).map((id) => [id, { score: id === 'performance' ? performance : 1 }]),
    ),
    audits: Object.fromEntries(
      Object.keys(config.assertions).map((id) => [id, { score: 1, scoreDisplayMode: 'binary' }]),
    ),
  };
}

test('default options cover all representative pages with the shared profile policies', () => {
  const options = parseArguments([]);
  assert.deepEqual(options.profiles, ['mobile', 'desktop']);
  assert.equal(options.pages.length, 8);
  assert.equal(options.runs, 3);
  assert.equal(isAbsolute(options.outputDirectory), true);
  assert.equal(config.minimum.performance, 0.95);
  assert.equal(config.minimum['best-practices'], 1);
  assert.equal(config.profiles.mobile.blockingPerformance, false);
  assert.equal(config.profiles.desktop.blockingPerformance, true);
});

test('CLI filters and output paths are parsed without launching servers or browsers', () => {
  const options = parseArguments([
    '--profile=desktop',
    '--page',
    'home,species',
    '--runs=2',
    '--output-dir=reports here',
  ]);
  assert.deepEqual(options.profiles, ['desktop']);
  assert.deepEqual(options.pages, ['home', 'species']);
  assert.equal(options.runs, 2);
  assert.equal(options.outputDirectory.endsWith('reports here'), true);
  assert.equal(parseArguments(['--help']).help, true);
});

test('invalid arguments fail before resources are acquired', () => {
  for (const args of [
    ['--profile=tablet'],
    ['--profile=mobile,mobile'],
    ['--page=missing'],
    ['--page=home,'],
    ['--page='],
    ['--runs=0'],
    ['--runs=11'],
    ['--runs=1.5'],
    ['--runs=1e0'],
    ['--runs='],
    ['--output-dir='],
    ['--output-dir=  '],
    ['--output-dir=reports\nother'],
    ['--unknown=value'],
    ['home'],
  ]) {
    assert.throws(() => parseArguments(args), undefined, args.join(' '));
  }
});

test('an output path that is a file fails without launching a benchmark', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'knowledge-lighthouse-test-'));
  try {
    const output = join(directory, 'file');
    await writeFile(output, 'existing file');
    await assert.rejects(runLighthouse(parseArguments([`--output-dir=${output}`])), { code: 'EEXIST' });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('all missing, failed, and errored audits remain visible alongside runtime errors', () => {
  const lhr = report();
  delete lhr.audits['document-title'];
  lhr.audits['image-alt'].score = 0;
  lhr.audits['unasserted-audit'] = { score: null, scoreDisplayMode: 'error', errorMessage: 'Collection failed' };
  lhr.runtimeError = { code: 'NO_FCP', message: 'No content painted' };
  const result = inspectRun(lhr);
  assert.equal(result.errors.length, 4);
  assert.ok(result.errors.some((error) => error.includes('NO_FCP')));
  assert.ok(result.errors.some((error) => error.includes('Missing required audit: document-title')));
  assert.ok(result.errors.some((error) => error.includes('Required audit image-alt')));
  assert.ok(result.errors.some((error) => error.includes('Audit error unasserted-audit')));
  assert.deepEqual(
    result.audits.map((audit) => audit.id),
    ['image-alt', 'unasserted-audit'],
  );
});

test('not-applicable audits pass but null or missing results cannot silently pass', () => {
  const lhr = report();
  lhr.audits['image-alt'] = { score: null, scoreDisplayMode: 'notApplicable' };
  assert.deepEqual(inspectRun(lhr).errors, []);
  lhr.audits['image-alt'].scoreDisplayMode = 'binary';
  assert.ok(inspectRun(lhr).errors.some((error) => error.includes('image-alt')));
  delete lhr.categories.seo;
  assert.ok(inspectRun(lhr).errors.some((error) => error.includes('category score: seo')));
  assert.ok(inspectRun(undefined).errors.includes('Lighthouse returned no result'));
});

test('category gates use medians across every requested run', () => {
  const runs = [0.89, 0.97, 0.99].map((score) => inspectRun(report(score)));
  assert.deepEqual(summarizeRuns(runs, 3), {
    median: { performance: 0.97, accessibility: 1, 'best-practices': 1, seo: 1 },
    errors: [],
    warnings: [],
    passed: true,
  });
  assert.ok(Math.abs(summarizeRuns(runs.slice(0, 2), 2).median.performance - 0.93) < Number.EPSILON);
  assert.equal(summarizeRuns(runs.slice(0, 2), 2).passed, false);
});

test('incomplete or errored runs fail even when remaining scores meet thresholds', () => {
  const successful = inspectRun(report());
  const errored = { ...successful, errors: ['Audit failed'] };
  assert.equal(summarizeRuns([successful, successful, errored], 3).passed, false);
  const incomplete = summarizeRuns([successful], 3);
  assert.equal(incomplete.passed, false);
  assert.equal(incomplete.median.performance, null);
  const invalid = summarizeRuns([{ ...successful, scores: { ...successful.scores, seo: null } }], 1);
  assert.equal(invalid.passed, false);
  assert.equal(invalid.median.seo, null);
});

test('mobile performance below the target is reported while desktop performance blocks', () => {
  const runs = [0.86, 0.9, 0.86].map((score) => inspectRun(report(score)));
  const mobile = summarizeRuns(runs, 3, config.profiles.mobile);
  assert.equal(mobile.median.performance, 0.86);
  assert.equal(mobile.passed, true);
  assert.deepEqual(mobile.errors, []);
  assert.deepEqual(mobile.warnings, ['performance: median 0.86 < 0.95 (reported target; does not block this profile)']);

  const desktop = summarizeRuns(runs, 3, config.profiles.desktop);
  assert.equal(desktop.passed, false);
  assert.deepEqual(desktop.errors, ['performance: median 0.86 < 0.95']);
  assert.deepEqual(desktop.warnings, []);
});

test('mobile still fails on missing performance scores, runtime errors, audits, and other categories', () => {
  const missingPerformance = report(0.86);
  missingPerformance.categories.performance.score = null;
  const runtimeFailure = { ...report(0.86), runtimeError: { code: 'NO_FCP', message: 'No content painted' } };
  const auditFailure = report(0.86);
  auditFailure.audits['image-alt'].score = 0;
  const missingAudit = report(0.86);
  delete missingAudit.audits['document-title'];
  const categoryFailure = report(0.86);
  categoryFailure.categories.accessibility.score = 0.99;
  for (const lhr of [missingPerformance, runtimeFailure, auditFailure, missingAudit, categoryFailure]) {
    const result = summarizeRuns([inspectRun(lhr)], 1, config.profiles.mobile);
    assert.equal(result.passed, false);
    assert.ok(result.errors.length > 0);
  }
  assert.equal(summarizeRuns([inspectRun(missingPerformance)], 1, config.profiles.mobile).median.performance, null);
});
