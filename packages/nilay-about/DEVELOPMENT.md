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
│   ├── layout.tsx                # メインレイアウト (Header/Footer)
│   ├── globals.css               # グローバルスタイルCSS
│   ├── page.tsx                  # ホームページ
│   ├── contact/                  # お問い合わせ
│   ├── news/                     # ニュース
│   │   ├── page.tsx             # 一覧
│   │   └── [id]/                # 詳細
│   └── labs/                     # Labs インデックス
├── components/
│   ├── layout/
│   │   ├── header.tsx           # ヘッダー
│   │   ├── footer.tsx           # フッター
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

Next.js の Route Groups を使用して、異なるレイアウトを分離しています。

```
app/
├── (standalone)/        # 独立したLabsアプリ - standalone.css
│   └── labs/           # home-target, game-species-test
├── layout.tsx          # メインサイト - globals.css
└── [その他ページ]/      # メインサイトを継承
```

#### メインサイト

`globals.css` で定義されたスタイル:

```css
:root {
  --background: #ffffff;
  --foreground: #2c3e50;
  --primary: #e27600;
}
```

#### Standalone（独立したLabsアプリ）

`standalone.css` で定義されたモダンマテリアルデザイン:

```css
:root {
  --background: #ffffff;
  --primary: #3b82f6;
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

### メインサイト

```tsx
// UIコンポーネントとレイアウトコンポーネント使用
import { Container, PageTitle } from "@/components/layout";
import { Card, CardContent, Button } from "@/components/ui";

<Container>
  <PageTitle title="お知らせ" subtitle="News" />
  <Card>
    <CardContent className="pt-6">
      <Button>詳細を見る</Button>
    </CardContent>
  </Card>
</Container>
```

### Standalone

```tsx
// UIコンポーネント使用（独自レイアウト）
import { Button, Card, CardContent } from "@/components/ui";

<div className="fixed inset-0 flex flex-col bg-background">
  <header className="bg-primary text-primary-foreground">
    <h1>アプリタイトル</h1>
  </header>
  <main>
    <Card>
      <CardContent className="pt-6">
        <Button variant="default">送信</Button>
      </CardContent>
    </Card>
  </main>
</div>
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
