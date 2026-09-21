export const siteConfig = {
  title: 'Nilay/Knowledge',
  description:
    '猟銃・空気銃の所持許可、狩猟免許、射撃・狩猟の基礎知識を紹介する情報サイト。許可の取得・更新手順、申請書類、関連法令、狩猟鳥獣図鑑、クレー射撃、関東地方の射撃場について調べられます。',
  siteUrl: 'https://knowledge.nilay.jp',
  repository: {
    url: 'https://github.com/sasakiuri/oss',
    branch: '1.x',
    contentPath: 'packages/nilay-knowledge/content',
  },
  author: {
    name: 'Nilay',
  },
  social: {
    twitter: 'NilayJP',
    facebook: 'NilaySport',
    facebookAppId: process.env.NEXT_PUBLIC_FACEBOOK_APP_ID ?? '',
    youtube: 'UC03yJGn_rZV2MTpr-ZrMZrA',
    instagram: 'NilayJP',
    github: 'nilay-jp',
  },
  service: {
    ecommerce: 'https://www.nilay.jp',
    gunman: 'https://gunman.nilay.jp',
    about: 'https://about.nilay.jp',
  },
} as const;

export type SiteConfig = typeof siteConfig;
