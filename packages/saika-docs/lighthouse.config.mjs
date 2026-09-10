// SPDX-License-Identifier: MIT
import shared from '@sasakiuri/lighthouse-config';

const config = {
  ...shared,
  pages: { home: '/', manual: '/getting-started/', components: '/reference/', material: '/reference/material/' },
};

export default config;
