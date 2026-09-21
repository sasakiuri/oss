import { fileURLToPath } from 'node:url';

import { prepareSizeBudget } from './scripts/prepare-size-budget.mjs';

// Compare transferred assets, with headroom above the production build baseline.
export default await prepareSizeBudget({
  rootDir: fileURLToPath(new URL('.', import.meta.url)),
  limits: {
    javascript: '330 kB',
    stylesheet: '20 kB',
    searchIndex: '125 kB',
    pdfIndex: '800 kB',
  },
});
