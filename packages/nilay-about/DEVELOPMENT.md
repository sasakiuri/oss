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
├── app/                      # Next.js App Router
│   ├── layout.tsx           # ルートレイアウト
│   ├── page.tsx             # ホームページ
│   ├── contact/             # お問い合わせ
│   ├── news/                # ニュース
│   │   ├── page.tsx        # 一覧
│   │   └── [id]/           # 詳細
│   └── labs/                # Labs
│       ├── game-species-test/
│       └── home-target/
├── components/
│   ├── layout/              # レイアウトコンポーネント
│   │   ├── header.tsx
│   │   ├── footer.tsx
│   │   ├── container.tsx
│   │   └── page-title.tsx
│   ├── ui/                  # UIプリミティブ
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── input.tsx
│   │   └── ...
│   ├── providers.tsx        # TanStack Query Provider
│   └── share-buttons.tsx
├── hooks/
│   ├── use-news.ts          # ニュース取得フック
│   └── use-contact.ts       # お問い合わせ送信フック
├── store/
│   ├── index.ts             # エクスポート
│   ├── ui-store.ts          # UI状態（アラート、ローディング）
│   ├── game-species-store.ts # 狩猟鳥獣クイズ状態
│   └── home-target-store.ts  # 射撃標的計算状態
├── lib/
│   ├── api/                 # API クライアント
│   │   ├── news.ts         # Firestore からニュース取得
│   │   └── contact.ts      # Cloud Functions 呼び出し
│   ├── firebase/
│   │   └── config.ts       # Firebase 初期化
│   ├── schemas/             # Zod スキーマ
│   │   ├── news.ts
│   │   └── contact.ts
│   ├── config.ts            # サイト設定
│   └── utils.ts             # ユーティリティ (cn関数)
└── public/
    └── images/
        ├── home-tanuki.png
        └── game-species/    # 狩猟鳥獣画像
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
    <Container>
      <PageTitle title="お知らせ" subtitle="News" />
      <NewsListClient />
    </Container>
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

### 状態管理

#### Zustand ストア (クライアント状態)

```ts
// store/ui-store.ts
import { create } from "zustand";

interface UIState {
  alert: AlertState | null;
  showSuccess: (title: string, message: string) => void;
  showError: (title: string, message: string) => void;
  clearAlert: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  alert: null,
  showSuccess: (title, message) =>
    set({ alert: { type: "success", title, message } }),
  showError: (title, message) =>
    set({ alert: { type: "error", title, message } }),
  clearAlert: () => set({ alert: null }),
}));
```

#### 使用例

```tsx
"use client";
import { useUIStore } from "@/store";

function MyComponent() {
  const { showSuccess, clearAlert } = useUIStore();

  const handleClick = () => {
    showSuccess("完了", "処理が完了しました");
  };
  // ...
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

### Tailwind CSS

```tsx
<div className="flex items-center gap-4 p-4 rounded-lg bg-secondary">
```

### CSS 変数 (globals.css)

```css
:root {
  --primary: #e27600;
  --foreground: #2c3e50;
  --secondary: #f8f9fa;
}
```

### UIコンポーネント (Radix UI ベース)

```tsx
import { Button } from "@/components/ui";

<Button variant="primary" size="lg">
  送信
</Button>
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

### Firestore 接続エラー

- Firebase Console で API キーとプロジェクト設定を確認
- ブラウザのコンソールでエラーメッセージを確認
