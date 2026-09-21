import type { ArticleCategoryId } from './categories';
import { articleDirectoryHref, getDirectoryCategories, type DirectoryArticle } from './taxonomy';

// Only subjects with an editorial introduction and multiple articles get a landing page.
// Single-article subjects continue to use the existing directory filter.
const introductions = {
  'getting-started': {
    title: '猟銃・空気銃の所持許可と狩猟免許の取得ガイド',
    description:
      '初めて銃の所持や狩猟を検討する方へ。猟銃・空気銃の所持許可と狩猟免許について、講習・試験から申請までの流れを紹介する記事をまとめています。',
    introduction:
      '銃の所持許可について知りたい方は「猟銃・空気銃所持許可の新規取得手順」、狩猟免許について知りたい方は「狩猟免許の取得手順」からお読みください。それぞれの記事で、講習や試験、申請書類を順に確認できます。',
  },
  procedures: {
    title: '猟銃・狩猟の手続き・申請書・法令ガイド',
    description:
      '猟銃・空気銃の所持許可の更新、ライフル銃の許可、技能講習、狩猟免許試験に関する記事をまとめています。申請書類、手数料、関連法令の一覧も探せます。',
    introduction:
      '手続きの流れは所持許可の更新や講習・試験の解説から、提出する書類は申請書・申込書の一覧から探せます。制度の根拠を確認する際は、法令等の一覧にある参照先もご覧ください。各記事の公開日・更新日を確認し、申請前には担当窓口の最新の案内をご確認ください。',
  },
  equipment: {
    title: '銃砲・実包・弾丸の種類と基礎知識',
    description:
      '銃砲と装弾について学ぶための記事一覧。ライフル銃・散弾銃・空気銃の分類や型式と、実包・弾丸の種類を、それぞれの解説記事で確認できます。',
    introduction:
      '銃そのものの分類や型式は「銃砲の種類と型式について」、実包や弾丸の分類は「実包・弾丸について」で紹介しています。知りたい用語に合わせて、各記事の目次から該当する項目へ進めます。',
  },
  resources: {
    title: '関東の射撃場・講習日程と関連団体の情報',
    description:
      '関東地方の射撃場、猟銃等講習・技能講習の日程の案内先、官公庁・関連団体・メーカーの情報をまとめています。目的に合った一覧から公式の案内を探せます。',
    introduction:
      '射撃場の場所や対応する種目を探す方は射撃場一覧、講習の開催情報を探す方は講習日程の記事へ進んでください。官公庁・関連団体・メーカーの一覧も掲載しています。訪問や申込みの前には、それぞれの公式サイトで現在の案内をご確認ください。',
  },
} satisfies Partial<Record<ArticleCategoryId, { title: string; description: string; introduction: string }>>;

export function getArticleCategoryPages(articles: DirectoryArticle[]) {
  return getDirectoryCategories(articles).flatMap((category) => {
    if (!Object.hasOwn(introductions, category.id)) return [];
    const matches = articles.filter((article) => article.category.id === category.id);
    if (matches.length < 2) return [];
    return [
      {
        ...category,
        ...introductions[category.id as keyof typeof introductions],
        path: `/articles/category/${category.id}/`,
        articles: matches,
      },
    ];
  });
}

export function articleCategoryHref(articles: DirectoryArticle[], id: ArticleCategoryId): string {
  return (
    getArticleCategoryPages(articles).find((category) => category.id === id)?.path ??
    `${articleDirectoryHref({ category: id })}#${id}`
  );
}
