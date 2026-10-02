import { fileURLToPath } from 'node:url';

import { createWebsiteVitestConfig } from '../repo-tooling/vitest.mjs';

const config = () => createWebsiteVitestConfig(fileURLToPath(new URL('.', import.meta.url)));

export default config;
