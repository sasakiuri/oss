// SPDX-License-Identifier: MIT
import shared from '@sasakiuri/lighthouse-config';

const config = {
  ...shared,
  profiles: {
    mobile: shared.profiles.mobile,
    desktop: shared.profiles.desktop,
  },
  minimum: { ...shared.minimum, performance: 0.95, 'best-practices': 1 },
  pages: {
    home: '/',
    articles: '/articles/',
    category: '/articles/category/getting-started/',
    species: '/articles/1403693668/',
    getting: '/articles/1378038316/',
    news: '/news/',
    newsDetail: '/news/20220128/',
    about: '/about/',
  },
};

export default config;
