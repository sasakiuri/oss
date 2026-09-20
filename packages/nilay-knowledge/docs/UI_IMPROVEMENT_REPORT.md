# Next.js UI 改善レポート

## packages/knowledge.website

**実施日**: 2025-12-07
**Next.js バージョン**: 16.0.7 (App Router)
**React バージョン**: 19.0.0
**CSS フレームワーク**: Tailwind CSS 4 + @tailwindcss/typography

---

## エグゼクティブサマリー

3サイクルの UI/UX レビューを実施し、アクセシビリティ、視覚デザイン、インタラクション、レスポンシブ対応の4つの領域で改善を行いました。

---

## 変更点サマリ

| カテゴリ         | 改善内容                                 | 影響                       |
| ---------------- | ---------------------------------------- | -------------------------- |
| アクセシビリティ | 検索フォームにフォーカスリング追加       | キーボード操作の可視性向上 |
| アクセシビリティ | 目次ナビに aria-label + 見出し追加       | スクリーンリーダー対応     |
| 視覚デザイン     | カード画像のグラデーションオーバーレイ   | テキスト視認性向上         |
| インタラクション | モバイルメニューにスライドアニメーション | 操作フィードバック改善     |
| レスポンシブ     | SubCard グリッドを3カラムに最適化        | レイアウト整合性向上       |
| 情報設計         | 全ページに h1追加                        | SEO・構造改善              |
| UI 基盤          | Card コンポーネント作成                  | 再利用性向上               |
| UI 基盤          | アニメーションユーティリティ追加         | 一貫したモーション         |

---

## Before / After UI 比較

### 1. カード画像上のテキスト

**Before:**

```
text-shadow で文字に影を追加
→ 背景によっては視認性が低い
```

**After:**

```
bg-gradient-to-t from-black/70 to-transparent
+ drop-shadow-md
→ 常に高コントラストを保証
```

### 2. 検索フォームのフォーカス状態

**Before:**

```css
focus: outline-none → フォーカスが視覚的に不明;
```

**After:**

```css
focus:ring-2 focus:ring-slate-500 focus:ring-offset-2
→ 明確なフォーカスインジケーター
```

### 3. モバイルメニュー

**Before:**

```
即座に表示/非表示
→ 唐突な遷移
```

**After:**

```css
animate-slide-in-from-left / animate-slide-out-to-left
animate-fade-in / animate-fade-out
→ スムーズなスライドアニメーション
```

---

## 使用したデザイン原則

### 1. コントラスト比の確保 (WCAG 2.1)

- 画像上のテキストにグラデーションオーバーレイを追加
- 最小コントラスト比 4.5:1 を確保

### 2. フォーカスの可視性 (WCAG 2.4.7)

- すべてのインタラクティブ要素に明確なフォーカスインジケーター
- `ring-offset` で背景との分離を確保

### 3. モーションの配慮 (WCAG 2.3.3)

- アニメーション時間は 200-300ms に制限
- `prefers-reduced-motion` 対応を検討（将来課題）

### 4. 情報階層の明確化

- 各ページに h1を配置
- カード内の見出しは h2で統一

---

## Next.js 実装への影響

### Server/Client Component 分離

```
app/
├── layout.tsx          (Server)
├── page.tsx            (Server) ← WebSiteSchema追加
├── articles/
│   ├── page.tsx        (Server) ← h1追加
│   └── [slug]/page.tsx (Server) ← 目次改善
├── news/page.tsx       (Server) ← h1追加
└── about/page.tsx      (Server) ← h1追加

components/
├── header.tsx          (Client) ← アニメーション追加
├── footer.tsx          (Client) ← ボタンテキスト追加
├── sns-share.tsx       (Client)
└── ui/
    ├── button.tsx      (Server/共用)
    └── card.tsx        (Server/共用) ← 新規作成
```

### CSS アーキテクチャ

```css
/* globals.css に追加されたアニメーション */
@theme {
  --animate-fade-in: fade-in 0.2s ease-out;
  --animate-fade-out: fade-out 0.2s ease-out;
  --animate-slide-in-from-left: slide-in-from-left 0.3s ease-out;
  --animate-slide-out-to-left: slide-out-to-left 0.3s ease-out;
}

@keyframes fade-in { ... }
@keyframes fade-out { ... }
@keyframes slide-in-from-left { ... }
@keyframes slide-out-to-left { ... }
```

---

## アクセシビリティ改善ログ

| 項目                 | WCAG 基準 | 改善内容                       |
| -------------------- | --------- | ------------------------------ |
| フォーカス可視性     | 2.4.7     | 検索フォームに focus:ring 追加 |
| 見出し構造           | 1.3.1     | 全ページに h1追加              |
| ナビゲーション       | 2.4.1     | 目次に aria-label 追加         |
| テキストコントラスト | 1.4.3     | 画像上テキストにオーバーレイ   |

---

## レスポンシブ改善ログ

| ブレークポイント | 改善内容                      |
| ---------------- | ----------------------------- |
| Mobile (default) | SubCard: 2カラム              |
| sm (640px+)      | SubCard: 3カラム（4→3に変更） |
| md (768px+)      | 目次表示、MainCard: 3カラム   |

---

## 残タスク（将来課題）

### 短期

1. **prefers-reduced-motion 対応**: アニメーションを無効化するオプション
2. **ダークモード対応**: Tailwind の dark バリアント活用
3. **画像ライトボックス**: 記事内画像のズーム機能

### 中期

4. **目次のスクロールスパイ**: 現在位置をハイライト
5. **検索機能強化**: Algolia/Pagefind 導入
6. **コンポーネントテスト拡充**: Card コンポーネントのテスト

---

## 変更ファイル一覧

### 新規作成

- `components/ui/card.tsx`

### 修正

- `app/globals.css` - アニメーションキーフレーム追加
- `app/page.tsx` - フォーカスリング、グラデーション、グリッド調整
- `app/articles/page.tsx` - h1追加
- `app/articles/[slug]/page.tsx` - 目次改善（aria-label, h2, sticky 位置）
- `app/news/page.tsx` - h1追加
- `app/about/page.tsx` - h1追加、カードタイトル変更
- `components/header.tsx` - モバイルメニューアニメーション
- `components/footer.tsx` - 「トップへ戻る」テキスト追加

---

## 運用上の注意点

### 1. アニメーション

Radix UI の `data-[state=open/closed]` 属性を使用しています。カスタムコンポーネントでアニメーションを追加する場合は同様のパターンを使用してください。

### 2. カードコンポーネント

`components/ui/card.tsx` を新規作成しました。既存のインライン Card は段階的にこちらに移行することを推奨します。

```tsx
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

<Card>
  <CardHeader>
    <CardTitle>タイトル</CardTitle>
  </CardHeader>
  <CardContent>コンテンツ</CardContent>
</Card>;
```

### 3. フォーカススタイル

新しいフォームコンポーネントを追加する際は、以下のクラスを適用してください：

```css
focus:ring-2 focus:ring-slate-500 focus:ring-offset-2
```

---

## 付録: コンポーネント Props ドキュメント

### Card

```typescript
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}
```

### CardTitle

```typescript
interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  children: React.ReactNode;
  as?: 'h2' | 'h3' | 'h4'; // デフォルト: 'h2'
}
```

---

**レポート作成者**: Claude Code
**レビュー完了**: 3サイクル完了
