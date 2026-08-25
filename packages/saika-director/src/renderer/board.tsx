import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Logger configuration must be done before any Logger.create() calls
import { Logger } from '@/shared/utils/Logger';

Logger.configure({
  minLevel: import.meta.env.PROD ? 'INFO' : 'DEBUG',
  consoleOutput: true,
  fileOutput: false, // File output is not available in renderer process
});

import BoardApp from './presentation/BoardApp';
import './index.css';
import './presentation/styles/print.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BoardApp />
  </StrictMode>,
);
