// SPDX-License-Identifier: MIT
export default {
  runs: 3,
  profiles: {
    desktop: { preset: "desktop", blockingPerformance: true },
    mobile: { blockingPerformance: false },
  },
  minimum: {
    performance: 0.9,
    accessibility: 1,
    "best-practices": 0.96,
    seo: 1,
  },
  assertions: {
    "errors-in-console": 1,
    "http-status-code": 1,
    "document-title": 1,
    "html-has-lang": 1,
    "image-alt": 1,
    "link-name": 1,
    "meta-viewport": 1,
  },
};
