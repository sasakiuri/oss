// SPDX-License-Identifier: MIT
'use client';
import { GoogleTagManager } from '@next/third-parties/google';
import Script from 'next/script';
import { useReportWebVitals } from 'next/web-vitals';
import { useEffect } from 'react';

import { publicEnv } from '../config/env';
import { withBasePath } from '../config/site';

function WebVitals() {
  useReportWebVitals((metric) => {
    if (!publicEnv.NEXT_PUBLIC_WEB_VITALS || process.env.NODE_ENV !== 'production') return;
    const body = JSON.stringify({ name: metric.name, value: metric.value, rating: metric.rating, id: metric.id });
    navigator.sendBeacon(withBasePath('/api/vitals/'), new Blob([body], { type: 'application/json' }));
  });
  return null;
}

export function Telemetry() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development' && publicEnv.NEXT_PUBLIC_DEV_AXE) {
      void Promise.all([import('@axe-core/react'), import('react'), import('react-dom')]).then(
        ([axe, React, ReactDOM]) => axe.default(React, ReactDOM, 1000),
      );
    }
  }, []);
  return (
    <>
      <WebVitals />
      {process.env.NODE_ENV === 'production' && publicEnv.NEXT_PUBLIC_GTM_ID && (
        <GoogleTagManager gtmId={publicEnv.NEXT_PUBLIC_GTM_ID} />
      )}
      {process.env.NODE_ENV === 'production' && publicEnv.NEXT_PUBLIC_CLARITY_ID && (
        <Script
          id="clarity"
          strategy="afterInteractive"
        >{`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y)})(window,document,"clarity","script","${publicEnv.NEXT_PUBLIC_CLARITY_ID}");`}</Script>
      )}
    </>
  );
}
