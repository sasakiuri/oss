/** Stable IDs used by article frontmatter and shared filter URLs. */
export const articleCategoryTitles = {
  'getting-started': 'イントロダクション',
  procedures: '制度と法令',
  equipment: '銃砲と装弾',
  hunting: '狩猟',
  shooting: '標的射撃',
  resources: 'その他',
  uncategorized: '未分類',
} as const;

export type ArticleCategoryId = keyof typeof articleCategoryTitles;

export interface ArticleCategory {
  id: ArticleCategoryId;
  title: string;
}

export const articleCategoryDefinitions: ArticleCategory[] = Object.entries(articleCategoryTitles).map(
  ([id, title]) => ({ id: id as ArticleCategoryId, title }),
);
