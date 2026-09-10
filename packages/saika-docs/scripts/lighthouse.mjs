// SPDX-License-Identifier: MIT
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { chromium } from '@playwright/test';
import { launch } from 'chrome-launcher';
import lighthouse from 'lighthouse';
import desktopConfig from 'lighthouse/core/config/desktop-config.js';

import config from '../lighthouse.config.mjs';

import { startServer } from './server.mjs';

const server = await startServer(5180);
const profile = await mkdtemp(join(tmpdir(), 'saika-docs-lighthouse-'));
let chrome;
const selectedProfile = process.argv.find((arg) => arg.startsWith('--profile='))?.slice('--profile='.length);
if (selectedProfile && !Object.hasOwn(config.profiles, selectedProfile)) throw new Error('Unknown Lighthouse profile');
const summary = {};
try {
  await mkdir('.lighthouse.reports', { recursive: true });
  for (const [profileName, profileConfig] of Object.entries(config.profiles)) {
    if (selectedProfile && selectedProfile !== profileName) continue;
    for (const [pageName, path] of Object.entries(config.pages)) {
      const name = `${profileName}-${pageName}`;
      await mkdir(join(profile, name), { recursive: true });
      chrome = await launch({
        userDataDir: join(profile, name),
        chromePath: process.env.CHROME_PATH || chromium.executablePath(),
        chromeFlags: [
          '--headless',
          '--no-sandbox',
          ...(process.env.PLAYWRIGHT_DISABLE_SOFTWARE_RASTERIZER === '1' ? ['--disable-software-rasterizer'] : []),
          '--disable-dev-shm-usage',
          `--user-data-dir=${join(profile, name)}`,
        ],
      });

      const runs = [];
      for (let run = 0; run < config.runs; run++) {
        const result = await lighthouse(
          `${server.url}${path}`,
          {
            port: chrome.port,
            output: ['html', 'json'],
            onlyCategories: Object.keys(config.minimum),
            extraHeaders: server.headers,
            logLevel: 'error',
          },
          profileConfig.preset === 'desktop' ? desktopConfig : undefined,
        );
        if (!result || result.lhr.runtimeError)
          throw new Error(`Lighthouse failed for ${name}: ${result?.lhr.runtimeError?.message}`);
        await writeFile(`.lighthouse.reports/${name}-${run}.html`, result.report[0]);
        await writeFile(`.lighthouse.reports/${name}-${run}.json`, result.report[1]);
        for (const [audit, minimum] of Object.entries(config.assertions)) {
          const check = result.lhr.audits[audit];
          if (!check || (check.score !== null && check.score < minimum))
            throw new Error(`Lighthouse assertion failed: ${name}/${audit}`);
        }
        runs.push(
          Object.fromEntries(
            Object.entries(result.lhr.categories).map(([key, category]) => [key, category.score ?? 0]),
          ),
        );
      }
      const median = Object.fromEntries(
        Object.keys(config.minimum).map((key) => [
          key,
          runs.map((run) => run[key]).sort((a, b) => a - b)[Math.floor(runs.length / 2)],
        ]),
      );
      await chrome.kill();
      chrome = undefined;
      summary[name] = { runs, median, blockingPerformance: profileConfig.blockingPerformance };
      console.log(name, median);
      for (const [key, minimum] of Object.entries(config.minimum))
        if (median[key] < minimum) {
          console.error(`${name}: ${key} ${median[key]} < ${minimum}`);
          if (key !== 'performance' || profileConfig.blockingPerformance) process.exitCode = 1;
          else
            console.warn(
              'Mobile performance is a reported optimization target; desktop and all other categories are required.',
            );
        }
    }
  }
} finally {
  await writeFile(
    '.lighthouse.reports/summary.json',
    JSON.stringify({ minimum: config.minimum, pages: summary }, null, 2),
  );
  await chrome?.kill();
  server.close();
  await rm(profile, { recursive: true, force: true });
}
