export const siteConfig = {
  title: 'Nilay/Knowledge',
  description:
    '実銃・射撃・狩猟の情報を紹介するサイト。所持許可（免許）の取得方法、狩猟免許の取得方法、狩猟鳥獣の図鑑、クレー・ライフル射撃のルール、猟銃・空気銃の掃除の仕方などを掲載しています。銃刀法の申請・申込書と添付書類PDFをオンラインで作成できます。',
  siteUrl: 'https://knowledge.nilay.jp',
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
