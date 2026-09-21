interface ArticleItem {
  title: string;
  slug: string;
  description?: string;
}

interface Category {
  id: string;
  title: string;
  articleList: ArticleItem[];
}

export const articleCategories: Category[] = [
  {
    id: 'news',
    title: 'ニュース',
    articleList: [
      {
        title: '銃・射撃・狩猟ニュース',
        slug: 'news',
        description: '射撃や狩猟中の事故・事件、法令改正に関するニュースなどを紹介しています。',
      },
    ],
  },
  {
    id: 'getting-started',
    title: 'イントロダクション',
    articleList: [
      {
        title: '猟銃・空気銃所持許可の新規取得手順',
        slug: `articles/1378038316`,
        description: '銃の所持方法。銃の免許である所持許可を取得する方法を紹介しています。',
      },
      {
        title: '狩猟免許の取得手順',
        slug: `articles/1403944258`,
        description: '狩猟の始め方。狩猟を始めるために必要な免許の取得手順を紹介しています。',
      },
    ],
  },
  {
    id: 'procedures',
    title: '制度と法令',
    articleList: [
      {
        title: '猟銃・空気銃所持許可の更新手順',
        slug: `articles/1403250921`,
      },
      {
        title: '猟銃用火薬類譲受許可の申請',
        slug: `articles/1413343626`,
      },
      {
        title: '猟銃用火薬類の取扱い',
        slug: `articles/1564639585`,
      },
      {
        title: 'ライフル銃の所持許可の取得手順',
        slug: `articles/1379069901`,
      },
      {
        title: '申請・申込手数料の一覧',
        slug: `articles/1379112442`,
      },
      {
        title: '銃・火薬・狩猟関係の申請書・申込書',
        slug: `articles/1597956932`,
      },
      {
        title: '銃砲・狩猟・火薬類に関連する法令一覧',
        slug: `articles/1379067191`,
      },
      {
        title: '技能講習について',
        slug: `articles/1414639098`,
        description: '技能講習の講習内容や指導基準を紹介しています。',
      },
      {
        title: '狩猟免許試験について',
        slug: `articles/1415891983`,
        description: '狩猟免許試験の試験内容や合格基準を紹介しています。',
      },
    ],
  },
  {
    id: 'equipment',
    title: '銃砲と装弾',
    articleList: [
      {
        title: '銃砲の種類と型式について',
        slug: `articles/1403941906`,
        description: '銃の分類とそれぞれの特徴について紹介しています。',
      },
      {
        title: '実包・弾丸について',
        slug: `articles/1414035778`,
        description: '弾の分類とそれぞれの特徴について紹介しています。',
      },
    ],
  },
  {
    id: 'hunting',
    title: '狩猟',
    articleList: [
      {
        title: '狩猟鳥獣図鑑',
        slug: `articles/1403693668`,
        description: '狩猟鳥獣の一覧・詳細とそれらの判別方法について紹介しています。',
      },
    ],
  },
  {
    id: 'shooting',
    title: '標的射撃',
    articleList: [
      {
        title: 'クレー射撃について',
        slug: `articles/1404015637`,
      },
    ],
  },
  {
    id: 'resources',
    title: 'その他',
    articleList: [
      {
        title: '関東地方の射撃場一覧',
        slug: `articles/1413972696`,
      },
      {
        title: '関東地方の猟銃等講習・技能講習開催日程',
        slug: `articles/1414030655`,
      },
      {
        title: '官公庁・関連団体・メーカー',
        slug: `articles/1418054543`,
      },
    ],
  },
];

/** Follow the curated article index, excluding its news landing-page link. */
export function getArticleNavigation(slug: string) {
  const articles = articleCategories.flatMap((category) =>
    category.articleList.filter((article) => article.slug.startsWith('articles/')),
  );
  const index = articles.findIndex((article) => article.slug === `articles/${slug}`);
  if (index < 0) return {};
  return { previous: articles[index - 1], next: articles[index + 1] };
}
