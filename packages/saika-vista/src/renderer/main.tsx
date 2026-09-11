// SPDX-License-Identifier: MIT
import { Component, StrictMode } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import { Audience } from './Audience';
import { Operator } from './Operator';
import './style.css';

class DisplayBoundary extends Component<{ children: ReactNode; audience: boolean }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(_error: Error, _info: ErrorInfo) {
    /* Operational errors stay outside the audience surface. */
  }
  render() {
    if (this.state.failed)
      return (
        <main className={this.props.audience ? 'audience' : 'operator loading'}>
          <section className="standby">
            <h1>Display temporarily unavailable</h1>
            <p>
              {this.props.audience
                ? 'Please wait for the display to resume.'
                : 'Reopen the Vista window to reload the workspace.'}
            </p>
          </section>
        </main>
      );
    return this.props.children;
  }
}
const audience = new URLSearchParams(window.location.search).has('screen');
document.title = audience ? 'Saika Vista · Audience' : 'Saika Vista';
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DisplayBoundary audience={audience}>{audience ? <Audience /> : <Operator />}</DisplayBoundary>
  </StrictMode>,
);
