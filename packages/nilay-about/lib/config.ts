export const siteConfig = {
  title: 'Nilay/About',
  author: {
    name: 'Nilay',
  },
  description:
    '射撃・狩猟・有害鳥獣駆除のための Nilay のサービス紹介。狩猟鳥獣の判別練習、弾道計算、くくりわなの規格ゲージなど、ブラウザーで使える無料ツールも公開しています。',
  siteUrl: 'https://about.nilay.jp',
  image: 'https://cdn.nilay.jp/ecommerce/res/e5b2d52de6422d7fa2a1c7c0eede2477e1b4883d.png',
  social: {
    twitter: 'NilayJP',
    facebook: 'NilaySport',
    facebookAppId: '2162823167069625',
    youtube: 'UC03yJGn_rZV2MTpr-ZrMZrA',
    instagram: 'NilayJP',
    github: 'nilay-jp',
  },
  contact: {
    email: 'contact@mail.nilay.jp',
    phone: '080-7059-1382',
  },
  location: {
    prefecture: '神奈川県',
    city: '横須賀市',
    street: '長井3-50-19',
  },
} as const;

export type SiteConfig = typeof siteConfig;
