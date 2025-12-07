import type { Metadata } from 'next';
import Link from 'next/link';
import { Breadcrumb } from '@/components/breadcrumb';
import { SnsShare } from '@/components/sns-share';

const title = '記事一覧';
const dir = 'articles';

export const metadata: Metadata = {
  title,
};

interface ArticleItem {
  title: string;
  slug: string;
  description?: string;
}

interface Category {
  title: string;
  articleList: ArticleItem[];
}

const categoryList: Category[] = [
  {
    title: 'ニュース',
    articleList: [
      {
        title: '銃・射撃・狩猟ニュース',
        slug: 'news',
        description:
          '射撃や狩猟中の事故・事件、法令改正に関するニュースなどを紹介しています。',
      },
    ],
  },
  {
    title: 'イントロダクション',
    articleList: [
      {
        title: '猟銃・空気銃所持許可の新規取得手順',
        slug: `${dir}/1378038316`,
        description:
          '銃の所持方法。銃の免許である所持許可を取得する方法を紹介しています。',
      },
      {
        title: '狩猟免許の取得手順',
        slug: `${dir}/1403944258`,
        description:
          '狩猟の始め方。狩猟を始めるために必要な免許の取得手順を紹介しています。',
      },
    ],
  },
  {
    title: '制度と法令',
    articleList: [
      {
        title: '猟銃・空気銃所持許可の更新手順',
        slug: `${dir}/1403250921`,
      },
      {
        title: '猟銃用火薬類譲受許可の申請',
        slug: `${dir}/1413343626`,
      },
      {
        title: '猟銃用火薬類の取扱い',
        slug: `${dir}/1564639585`,
      },
      {
        title: 'ライフル銃の所持許可取得の取得手順',
        slug: `${dir}/1379069901`,
      },
      {
        title: '申請・申込手数料の一覧',
        slug: `${dir}/1379112442`,
      },
      {
        title: '銃・火薬・狩猟関係の申請書・申込書',
        slug: `${dir}/1597956932`,
      },
      {
        title: '銃砲・狩猟・火薬類に関連する法令一覧',
        slug: `${dir}/1379067191`,
      },
      {
        title: '技能講習について',
        slug: `${dir}/1414639098`,
        description: '技能講習の講習内容や指導基準を紹介しています。',
      },
      {
        title: '狩猟免許試験について',
        slug: `${dir}/1415891983`,
        description: '狩猟免許試験の試験内容や合格基準を紹介しています。',
      },
    ],
  },
  {
    title: '銃砲と装弾',
    articleList: [
      {
        title: '銃砲の種類と型式について',
        slug: `${dir}/1403941906`,
        description: '銃の分類とそれぞれの特徴について紹介しています。',
      },
      {
        title: '実包・弾丸について',
        slug: `${dir}/1414035778`,
        description: '弾の分類とそれぞれの特徴について紹介しています。',
      },
    ],
  },
  {
    title: '狩猟',
    articleList: [
      {
        title: '狩猟鳥獣図鑑',
        slug: `${dir}/1403693668`,
        description:
          '狩猟鳥獣の一覧・詳細とそれらの判別方法について紹介しています。',
      },
    ],
  },
  {
    title: '標的射撃',
    articleList: [
      {
        title: 'クレー射撃について',
        slug: `${dir}/1404015637`,
      },
    ],
  },
  {
    title: 'その他',
    articleList: [
      {
        title: '関東地方の射撃場一覧',
        slug: `${dir}/1413972696`,
      },
      {
        title: '関東地方の猟銃等講習・技能講習開催日程',
        slug: `${dir}/1414030655`,
      },
      {
        title: '官公庁・関連団体・メーカー',
        slug: `${dir}/1418054543`,
      },
    ],
  },
];

export default function ArticlesPage() {
  return (
    <>
      <Breadcrumb
        items={[
          { name: 'トップ', slug: '' },
          { name: title, slug: dir },
        ]}
      />
      <SnsShare title={title} slug={dir} />

      <div className="mx-auto max-w-3xl space-y-8 px-4 py-8">
        <h1 className="text-2xl font-bold text-slate-800">{title}</h1>
        {categoryList.map((category) => (
          <div
            key={category.title}
            className="overflow-hidden rounded-lg border border-slate-200 bg-white"
          >
            <h2 className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-lg font-bold text-slate-800">
              {category.title}
            </h2>
            <ul className="divide-y divide-slate-200">
              {category.articleList.map((article) => (
                <li key={article.slug}>
                  <Link
                    href={`/${article.slug}`}
                    className="block px-4 py-3 text-blue-600 hover:bg-slate-50"
                  >
                    <span className="font-medium">{article.title}</span>
                    {article.description && (
                      <p className="mt-1 text-sm text-slate-600">
                        {article.description}
                      </p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </>
  );
}
