// SPDX-License-Identifier: MIT
import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './presentation/App';
import { ErrorBoundary } from './presentation/components/common/ErrorBoundary';

const root = createRoot(document.getElementById('root')!);
root.render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
