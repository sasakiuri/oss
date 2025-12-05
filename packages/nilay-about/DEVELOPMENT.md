# 開発ガイド

## 環境構築

### 前提条件

- Node.js 22+
- npm 10+
- Docker (オプション)

### ローカル開発

```bash
# リポジトリのルートから
cd packages/about.website

# 依存関係インストール
npm install

# 開発サーバー起動（Turbopack使用）
npm run dev

# http://localhost:3000 でアクセス
```

### Docker 開発環境

```bash
# docker ディレクトリに移動
cd docker

# コンテナ起動
docker compose up node-about

# アクセス URL
# http://127.100.0.11:80
# または hosts に追加して http://about.nilay.test
```

## コマンド一覧

| コマンド | 説明 |
|----------|------|
| `npm run dev` | 開発サーバー起動（Turbopack） |
| `npm run build` | 本番ビルド |
| `npm run start` | 本番サーバー起動 |
| `npm run lint` | ESLint 実行 |
| `npm run format` | Prettier でフォーマット |

## アーキテクチャ

### デザインコンセプト

**「2025年の技術で実装された、1990年のWebサイト」**

- **メインサイト**: 1990年代CERN風レトロデザイン
- **Labsアプリ**: モダンマテリアルデザイン

### ディレクトリ構成

```
about.website/
├── app/
│   ├── (standalone)/             # 独立したLabsアプリ (Route Group)
│   │   ├── layout.tsx           # Standalone専用レイアウト
│   │   ├── standalone.css       # モダンマテリアルデザインCSS
│   │   └── labs/
│   │       ├── game-species-test/
│   │       │   ├── _store/      # 機能専用Zustandストア
│   │       │   ├── quiz-data.ts
│   │       │   ├── game-species-test-client.tsx
│   │       │   └── page.tsx
│   │       └── home-target/
│   │           ├── _store/      # 機能専用Zustandストア
│   │           ├── home-target-client.tsx
│   │           └── page.tsx
│   ├── layout.tsx                # メインレイアウト (RetroHeader/Footer)
│   ├── globals.css               # レトロCERNスタイルCSS
│   ├── page.tsx                  # ホームページ
│   ├── contact/                  # お問い合わせ
│   ├── news/                     # ニュース
│   │   ├── page.tsx             # 一覧
│   │   └── [id]/                # 詳細
│   └── labs/                     # Labs インデックス
├── components/
│   ├── layout/
│   │   ├── retro-header.tsx     # レトロスタイルヘッダー
│   │   ├── retro-footer.tsx     # レトロスタイルフッター
│   │   ├── header.tsx           # モダンヘッダー (参照用)
│   │   ├── footer.tsx           # モダンフッター (参照用)
│   │   ├── container.tsx
│   │   └── page-title.tsx
│   ├── ui/                       # UIプリミティブ
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── input.tsx
│   │   └── ...
│   ├── providers.tsx             # TanStack Query Provider
│   └── share-buttons.tsx
├── hooks/
│   ├── use-news.ts               # ニュース取得フック
│   └── use-contact.ts            # お問い合わせ送信フック
├── store/
│   ├── index.ts                  # エクスポート
│   └── ui-store.ts               # グローバルUI状態
├── lib/
│   ├── api/                      # API クライアント
│   │   ├── news.ts
│   │   └── contact.ts
│   ├── firebase/
│   │   └── config.ts
│   ├── schemas/                  # Zod スキーマ
│   │   ├── news.ts
│   │   └── contact.ts
│   ├── utils/
│   │   └── array.ts             # 配列ユーティリティ (shuffle等)
│   ├── config.ts                 # サイト設定
│   └── utils.ts                  # cn関数など
└── public/
    └── images/
        ├── home-tanuki.png
        └── game-species/         # 狩猟鳥獣画像
```

### Route Groups による UI 分離

Next.js の Route Groups を使用して、異なるデザインシステムを分離しています。

```
app/
├── (standalone)/        # モダンUI - standalone.css
│   └── labs/           # home-target, game-species-test
├── layout.tsx          # レトロUI - globals.css
└── [その他ページ]/      # レトロUIを継承
```

#### メインサイト（レトロUI）

`globals.css` で定義されたCERN風スタイル:

```css
:root {
  --background: #c0c0c0;    /* グレー背景 */
  --link: #0000ee;          /* 青リンク */
}
body {
  font-family: "Times New Roman", serif;
}
```

#### Standalone（モダンUI）

`standalone.css` で定義されたマテリアルデザイン:

```css
:root {
  --background: #ffffff;    /* 白背景 */
  --primary: #3b82f6;       /* 青プライマリ */
}
body {
  font-family: "Inter", sans-serif;
}
```

### コンポーネント設計

#### Server Components (デフォルト)

- メタデータ設定
- 静的コンテンツ
- レイアウト

```tsx
// app/news/page.tsx
export const metadata: Metadata = {
  title: "お知らせ",
};

export default function NewsPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1>お知らせ (News)</h1>
      <NewsListClient />
    </div>
  );
}
```

#### Client Components

- インタラクティブな UI
- データフェッチング（TanStack Query）
- フォーム

```tsx
// app/news/news-list-client.tsx
"use client";

export function NewsListClient() {
  const { data, isLoading } = useNewsList();
  // ...
}
```

### 状態管理

#### グローバルストア (store/)

アプリ全体で共有する状態:

```ts
// store/ui-store.ts
export const useUIStore = create<UIState>((set) => ({
  alert: null,
  showSuccess: (title, message) =>
    set({ alert: { type: "success", title, message } }),
  showError: (title, message) =>
    set({ alert: { type: "error", title, message } }),
  clearAlert: () => set({ alert: null }),
}));
```

#### 機能別ストア (_store/)

Labs アプリは機能ごとにストアを持つ:

```ts
// app/(standalone)/labs/home-target/_store/index.ts
export const useHomeTargetStore = create<HomeTargetStore>((set) => ({
  language: "ja",
  setLanguage: (language) => set({ language }),
  // ...
}));

// 計算関数は純粋関数として分離
export function calculateHeightOfTarget(...) { ... }
```

### データフェッチング

#### API 関数 (lib/api/)

```ts
// lib/api/news.ts
export async function fetchNewsList(): Promise<NewsListResponse> {
  const db = getFirestoreDb();
  const newsCollection = collection(db, "news");
  // ...
}
```

#### TanStack Query フック (hooks/)

```ts
// hooks/use-news.ts
export function useNewsList() {
  return useQuery({
    queryKey: ["news", "list"],
    queryFn: fetchNewsList,
  });
}
```

### フォームバリデーション

#### Zod スキーマ

```ts
// lib/schemas/contact.ts
export const contactFormSchema = z.object({
  requiresReply: z.boolean(),
  email: z.string().email().optional(),
  title: z.string().min(1),
  message: z.string().min(1),
});
```

#### React Hook Form

```tsx
const { register, handleSubmit, formState: { errors } } = useForm({
  resolver: zodResolver(contactFormSchema),
});
```

## スタイリング

### レトロスタイル（メインサイト）

```tsx
// シンプルなHTML構造
<div className="max-w-3xl mx-auto px-4 py-8">
  <h1>お知らせ (News)</h1>
  <hr />
  <ul>
    <li>...</li>
  </ul>
</div>
```

### モダンスタイル（Standalone）

```tsx
// UIコンポーネント使用
import { Button, Card, CardContent } from "@/components/ui";

<Card>
  <CardContent className="pt-6">
    <Button variant="primary">送信</Button>
  </CardContent>
</Card>
```

## Firebase 連携

### 設定

```ts
// lib/firebase/config.ts
const firebaseConfig = {
  projectId: "nilay-about",
  // ...
};
```

### Firestore

- コレクション: `news`
- ドキュメント構造:
  - `title`: string
  - `date`: Timestamp
  - `message`: string (HTML)

### Cloud Functions

- `sendContactMessage`: お問い合わせ送信

## トラブルシューティング

### ビルドエラー

```bash
# キャッシュクリア
rm -rf .next
npm run build
```

### 型エラー

```bash
# 型チェック
npx tsc --noEmit
```

### スタイルが反映されない

- Route Group のレイアウトが正しいCSSをインポートしているか確認
- `(standalone)` は `standalone.css`
- その他は `globals.css`

### Firestore 接続エラー

- Firebase Console で API キーとプロジェクト設定を確認
- ブラウザのコンソールでエラーメッセージを確認
