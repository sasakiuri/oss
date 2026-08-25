import React from 'react';
import ReactDOM from 'react-dom/client';

// Logger configuration must be done before any Logger.create() calls
import { Logger } from '@/shared/utils/Logger';

Logger.configure({
  minLevel: import.meta.env.PROD ? 'INFO' : 'DEBUG',
  consoleOutput: true,
  fileOutput: false, // File output is not available in renderer process
});

import './index.css';
import './presentation/styles/print.css';
import { App } from './presentation/App';
import { ElectronEventBus } from './events/ElectronEventBus';
import { EventBusProvider } from './events/EventBusProvider';
import { EventSyncProvider } from './presentation/providers/EventSyncProvider';

const eventBus = new ElectronEventBus();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <EventBusProvider bus={eventBus}>
      <EventSyncProvider>
        <App />
      </EventSyncProvider>
    </EventBusProvider>
  </React.StrictMode>,
);
