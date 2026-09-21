interface ArticleItem {
  title: string;
  slug: string;
  description?: string;
}

/** Editorial reading order and optional descriptions, independent of article classification. */
export const articleReadingOrder: ArticleItem[] = [
  {
    title: '猟銃・空気銃所持許可の新規取得手順',
    slug: 'articles/1378038316',
    description: '銃の所持方法。銃の免許である所持許可を取得する方法を紹介しています。',
  },
  {
    title: '狩猟免許の取得手順',
    slug: 'articles/1403944258',
    description: '狩猟の始め方。狩猟を始めるために必要な免許の取得手順を紹介しています。',
  },
  {
    title: '猟銃・空気銃所持許可の更新手順',
    slug: 'articles/1403250921',
  },
  {
    title: '猟銃用火薬類譲受許可の申請',
    slug: 'articles/1413343626',
  },
  {
    title: '猟銃用火薬類の取扱い',
    slug: 'articles/1564639585',
  },
  {
    title: 'ライフル銃の所持許可の取得手順',
    slug: 'articles/1379069901',
  },
  {
    title: '申請・申込手数料の一覧',
    slug: 'articles/1379112442',
  },
  {
    title: '銃・火薬・狩猟関係の申請書・申込書',
    slug: 'articles/1597956932',
  },
  {
    title: '銃砲・狩猟・火薬類に関連する法令一覧',
    slug: 'articles/1379067191',
  },
  {
    title: '技能講習について',
    slug: 'articles/1414639098',
    description: '技能講習の講習内容や指導基準を紹介しています。',
  },
  {
    title: '狩猟免許試験について',
    slug: 'articles/1415891983',
    description: '狩猟免許試験の試験内容や合格基準を紹介しています。',
  },
  {
    title: '銃砲の種類と型式について',
    slug: 'articles/1403941906',
    description: '銃の分類とそれぞれの特徴について紹介しています。',
  },
  {
    title: '実包・弾丸について',
    slug: 'articles/1414035778',
    description: '弾の分類とそれぞれの特徴について紹介しています。',
  },
  {
    title: '狩猟鳥獣図鑑',
    slug: 'articles/1403693668',
    description: '狩猟鳥獣の一覧・詳細とそれらの判別方法について紹介しています。',
  },
  {
    title: 'クレー射撃について',
    slug: 'articles/1404015637',
  },
  {
    title: '関東地方の射撃場一覧',
    slug: 'articles/1413972696',
  },
  {
    title: '関東地方の猟銃等講習・技能講習開催日程',
    slug: 'articles/1414030655',
  },
  {
    title: '官公庁・関連団体・メーカー',
    slug: 'articles/1418054543',
  },
];

export function getArticleNavigation(slug: string) {
  const index = articleReadingOrder.findIndex((article) => article.slug === `articles/${slug}`);
  if (index < 0) return {};
  return { previous: articleReadingOrder[index - 1], next: articleReadingOrder[index + 1] };
}
