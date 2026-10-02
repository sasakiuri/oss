import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';

import { createWebsiteVitestConfig } from '../repo-tooling/vitest.mjs';

const config = () => createWebsiteVitestConfig(fileURLToPath(new URL('.', import.meta.url)), { react });

export default config;
