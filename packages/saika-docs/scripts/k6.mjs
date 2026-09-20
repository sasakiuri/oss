// SPDX-License-Identifier: MIT
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { startServer } from './server.mjs';

const image = 'grafana/k6:1.4.1@sha256:200d24a0770ad12761569993c723fd7d48b29fc7983ff5f976bf8b8dba4c7d21';

export function loadConfiguration(mode, env) {
  if (!['smoke', 'load'].includes(mode)) throw new Error('Select smoke or load.');
  const smoke = mode === 'smoke';
  const required = (key) => {
    if (!env[key]) throw new Error(`${key} is required for an explicitly targeted load test.`);
    return env[key];
  };
  const positiveInteger = (key) => {
    const value = Number(required(key));
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${key} must be a positive integer.`);
    return value;
  };
  let baseUrl;
  if (!smoke) {
    const url = new URL(required('DOCS_LOAD_BASE_URL'));
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
      throw new Error('DOCS_LOAD_BASE_URL must be an HTTP(S) URL without credentials, query or fragment.');
    baseUrl = url.href.replace(/\/$/, '');
  }
  let authorization = '';
  if (env.DOCS_PREVIEW_AUTH === '1') {
    if (!env.PREVIEW_AUTH_USER || !env.PREVIEW_AUTH_PASSWORD)
      throw new Error('Preview authentication requires PREVIEW_AUTH_USER and PREVIEW_AUTH_PASSWORD.');
    authorization = `Basic ${Buffer.from(`${env.PREVIEW_AUTH_USER}:${env.PREVIEW_AUTH_PASSWORD}`).toString('base64')}`;
  }
  const thresholds = { checks: ['rate==1'], http_req_failed: ['rate==0'] };
  if (smoke) thresholds.iterations = ['count==5'];
  else {
    const p95 = positiveInteger('DOCS_LOAD_P95_MS');
    thresholds['http_req_duration{name:health}'] = [`p(95)<${p95}`];
    thresholds['http_req_duration{name:catalog}'] = [`p(95)<${p95}`];
    thresholds.dropped_iterations = ['count==0'];
  }
  return {
    baseUrl,
    authorization,
    options: {
      maxRedirects: 0,
      thresholds,
      scenarios: smoke
        ? { smoke: { executor: 'shared-iterations', vus: 1, iterations: 5, maxDuration: '1m' } }
        : {
            load: {
              executor: 'constant-arrival-rate',
              rate: positiveInteger('DOCS_LOAD_RATE'),
              timeUnit: '1s',
              duration: required('DOCS_LOAD_DURATION'),
              preAllocatedVUs: positiveInteger('DOCS_LOAD_VUS'),
            },
          },
    },
  };
}

async function run(mode) {
  const configuration = loadConfiguration(mode, process.env);
  let server;
  try {
    if (mode === 'smoke') server = await startServer(5188);
    const env = {
      ...process.env,
      DOCS_LOAD_BASE_URL: server?.url ?? configuration.baseUrl,
      DOCS_LOAD_AUTHORIZATION: configuration.authorization,
      DOCS_LOAD_OPTIONS: JSON.stringify(configuration.options),
      DOCS_LOAD_PROFILE: mode,
    };
    const child = spawn(
      process.env.K6_BINARY || 'docker',
      process.env.K6_BINARY
        ? ['run', 'tests/load/docs.js']
        : [
            'run',
            '--rm',
            '--network=host',
            '--volume',
            `${fileURLToPath(new URL('..', import.meta.url))}:/work:ro`,
            '--workdir=/work',
            ...['DOCS_LOAD_BASE_URL', 'DOCS_LOAD_AUTHORIZATION', 'DOCS_LOAD_OPTIONS', 'DOCS_LOAD_PROFILE'].flatMap(
              (key) => ['--env', key],
            ),
            image,
            'run',
            'tests/load/docs.js',
          ],
      { stdio: 'inherit', env },
    );
    const stop = () => child.kill('SIGTERM');
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    try {
      const code = await new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', (code) => resolve(code ?? 1));
      });
      process.exitCode = code;
    } finally {
      process.removeListener('SIGINT', stop);
      process.removeListener('SIGTERM', stop);
    }
  } finally {
    server?.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await run(process.argv[2]);
