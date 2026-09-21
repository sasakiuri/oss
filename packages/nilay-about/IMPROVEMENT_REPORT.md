# Next.js 改善レポート

> この文書は取り込み元の改善履歴です。現在の構成・検証手順は [開発ガイド](DEVELOPMENT.md) を参照してください。

## プロジェクト概要

| 項目               | 内容                |
| ------------------ | ------------------- |
| プロジェクト名     | @acme/about.website |
| Next.js バージョン | 16.0.7 (App Router) |
| React バージョン   | 19.2.0              |
| 想定デプロイ先     | Vercel              |

---

## 変更点サマリ

### サイクル1: セキュリティヘッダー追加

**ファイル**: `next.config.ts`

```diff
+ const securityHeaders = [
+   { key: "X-DNS-Prefetch-Control", value: "on" },
+   { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
+   { key: "X-Frame-Options", value: "SAMEORIGIN" },
+   { key: "X-Content-Type-Options", value: "nosniff" },
+   { key: "Referrer-Policy", value: "origin-when-cross-origin" },
+   { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
+ ];
+
+ async headers() {
+   return [{ source: "/:path*", headers: securityHeaders }];
+ }
```

**効果**: XSS、クリックジャッキング、MIME スニッフィング攻撃への防御強化

---

### サイクル2: Middleware 追加（CSP 準備）

**新規ファイル**: `middleware.ts`

- CSP ヘッダー（Report-Only モード）
- Nonce 生成（将来の script nonce 対応準備）
- 開発環境でのリクエストログ

---

### サイクル2: バグ修正

**ファイル**: `hooks/use-contact.ts`

```diff
- const showAlert = useUIStore((state) => state.showAlert);
+ const { showError, showSuccess } = useUIStore();
```

**理由**: `showAlert` は UI Store に存在しないメソッドだった

---

### サイクル2: アクセシビリティ改善

**ファイル**: `app/contact/contact-form.tsx`

```diff
+ aria-describedby={errors.email ? "email-error" : undefined}
+ aria-invalid={errors.email ? "true" : undefined}
+ aria-required="true"

+ <span id="email-error" role="alert" className="block text-destructive mt-1">
```

**効果**: スクリーンリーダーがエラーメッセージを即座にアナウンス

---

### サイクル2: エラーハンドリング強化

**ファイル**: `app/(standalone)/labs/home-target/home-target-client.tsx`

```diff
+ if (!response.ok) {
+   throw new Error(language === "ja" ? "PDF の生成に失敗しました..." : "Failed to generate PDF...");
+ }
+ const contentType = response.headers.get("content-type");
+ if (!contentType?.includes("application/pdf")) {
+   throw new Error(...);
+ }
```

**効果**: 外部 API のエラーを適切にユーザーに通知

---

### サイクル3: テスト基盤追加

**新規ファイル**:

- `vitest.config.ts` - Vitest 設定
- `playwright.config.ts` - Playwright 設定
- `__tests__/setup.ts` - テストセットアップ
- `__tests__/unit/lib/security/sanitize.test.ts` - セキュリティユーティリティテスト
- `__tests__/unit/store/home-target-store.test.ts` - Zustand ストアテスト
- `__tests__/e2e/contact.spec.ts` - お問い合わせページ E2E テスト
- `__tests__/e2e/home-target.spec.ts` - Target Calculator E2E テスト

---

## デプロイ前チェックリスト

### 環境変数

| 変数名                                     | 用途                      | 必須                                 |
| ------------------------------------------ | ------------------------- | ------------------------------------ |
| `NEXT_PUBLIC_FIREBASE_API_KEY`             | Firebase API キー         | Yes                                  |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`         | Firebase Auth ドメイン    | Yes                                  |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID`          | Firebase プロジェクト ID  | Yes                                  |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`      | Firebase Storage バケット | Yes                                  |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase Messaging ID     | Yes                                  |
| `NEXT_PUBLIC_FIREBASE_APP_ID`              | Firebase アプリ ID        | Yes                                  |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`      | Firebase Analytics ID     | No                                   |
| `NEXT_PUBLIC_SITE_URL`                     | サイト URL                | No (default: https://about.nilay.jp) |

### Vercel Secrets

```bash
# Vercel CLI で設定
vercel env add NEXT_PUBLIC_FIREBASE_API_KEY
vercel env add NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
# ... 他の環境変数
```

### CSP 設定

現在 Report-Only モードで運用。本番適用前に以下を確認：

1. ブラウザコンソールで CSP 違反レポートを確認
2. 問題がなければ `Content-Security-Policy-Report-Only` → `Content-Security-Policy` に変更

### ヘルスチェック

```bash
# ビルド確認
npm run build

# リント確認
npm run lint

# 型チェック
npx tsc --noEmit
```

---

## テストレポート

### ユニットテスト

| テストファイル              | テスト数 | カバー対象                   |
| --------------------------- | -------- | ---------------------------- |
| `sanitize.test.ts`          | 15       | セキュリティユーティリティ   |
| `home-target-store.test.ts` | 15       | Zustand ストア、計算ロジック |

### E2E テスト

| テストファイル        | シナリオ数 | カバー対象                                 |
| --------------------- | ---------- | ------------------------------------------ |
| `contact.spec.ts`     | 9          | お問い合わせフォーム、バリデーション、a11y |
| `home-target.spec.ts` | 13         | 計算機能、言語切替、ダイアログ、a11y       |

### テスト実行コマンド

```bash
# 依存インストール
npm install

# ユニットテスト
npm run test

# カバレッジ付き
npm run test:coverage

# E2E テスト
npm run test:e2e

# E2E テスト（UI モード）
npm run test:e2e:ui
```

---

## 残タスク

| タスク                              | 優先度     | 詳細                                                    |
| ----------------------------------- | ---------- | ------------------------------------------------------- |
| Firebase API キーのハードコード削除 | **High**   | `lib/env.ts` の devDefaults を環境変数のみに変更        |
| CSP 本番適用                        | **Medium** | Report-Only → 強制モードへ移行                          |
| 統合テスト追加                      | **Medium** | API モック（MSW）を使った TanStack Query フックのテスト |
| Bundle Analyzer 導入                | **Low**    | `@next/bundle-analyzer` でバンドルサイズ監視            |
| Lighthouse CI 導入                  | **Low**    | パフォーマンス・a11y の継続的監視                       |

---

## アーキテクチャ図

```
┌─────────────────────────────────────────────────────────────────┐
│                        Next.js 16 App Router                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐     ┌─────────────────────────────────────┐   │
│  │ middleware  │────▶│           Route Groups              │   │
│  │ (CSP, logs) │     ├─────────────────┬───────────────────┤   │
│  └─────────────┘     │   (root)        │   (standalone)    │   │
│                      │   Retro Theme   │   M3 Theme        │   │
│                      ├─────────────────┼───────────────────┤   │
│                      │ /               │ /labs/home-target │   │
│                      │ /news           │ /labs/game-species│   │
│                      │ /contact        │                   │   │
│                      │ /labs           │                   │   │
│                      └─────────────────┴───────────────────┘   │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    State Management                       │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │  Zustand (Client State)  │  TanStack Query (Server State)│  │
│  │  - UI Store              │  - News List                  │  │
│  │  - Feature Stores        │  - Contact Form               │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                    External Services                      │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │  Firebase Firestore  │  Firebase Functions  │  Gunman API│  │
│  │  (News data)         │  (Contact form)      │  (PDF gen) │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 参考資料

- [Next.js Security Headers](https://nextjs.org/docs/app/api-reference/config/next-config-js/headers)
- [Content Security Policy (MDN)](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [WCAG 2.1 Guidelines](https://www.w3.org/TR/WCAG21/)
- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)

---

_Generated: 2025-12-06_
