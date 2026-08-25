# UIテキストレイアウト記法 仕様書 v1.2

## 1. 目的

本仕様は、UI 画面・部品・状態・資産をスクリーンショットなしでテキスト表現し、設計・レビュー・差分管理・実装対応を容易にするための統一記法を定義する。

---

## 2. 設計方針

- 等幅フォント前提
- 画面構造、再利用部品、単純要素、資産、状態を区別する
- 見た目ではなく意味で命名する
- フレームワーク依存ではなく、MUI / Ant Design / Chakra UI / Bootstrap / Radix 系の主要概念を表現できることを目標とする
- 生の SVG / JSX / HTML / CSS は本文に埋め込まない

---

## 3. レイヤー

| レイヤー  | 用途                | 記法例                            |
| --------- | ------------------- | --------------------------------- |
| Layout    | 画面構造            | `+---- HEADER ----+`              |
| Component | 再利用部品          | `<Component: SearchBar>`          |
| Element   | 単純 UI 要素        | `[保存]`, `<Input: 検索>`         |
| Asset     | アイコン・画像・SVG | `:search:`, `<SVG: logo>`         |
| State     | UI状態              | `<Loading...>`, `{success: 有効}` |

---

## 4. 命名規則

| 対象             | ルール     | 例                                  |
| ---------------- | ---------- | ----------------------------------- |
| アイコン         | kebab-case | `:chevron-down:`                    |
| SVG/画像ID       | kebab-case | `<SVG: app-logo>`                   |
| コンポーネント名 | PascalCase | `<Component: UserTable>`            |
| インスタンスID   | kebab-case | `<Component#user-table: UserTable>` |
| スロット名       | kebab-case | `<Slot: footer>`                    |

禁止:

- 絵文字でアイコンを代用しない
- `Box1` `AreaA` のような意味の弱い名前を使わない
- 同じ意味に複数記法を混在させない

---

## 5. レイアウト記法

### 5.1 画面

```text
+---------------- SCREEN: ユーザー管理 ----------------+
|                                                      |
+------------------------------------------------------+
```

### 5.2 標準領域

```text
+---------------- HEADER ------------------------------+
|                                                      |
+---------------- BODY --------------------------------+
|                                                      |
+---------------- FOOTER ------------------------------+
|                                                      |
+------------------------------------------------------+
```

### 5.3 分割

```text
+---------------- BODY --------------------------------+
| +---- SIDEBAR ----+ +----------- MAIN ------------+  |
| |                 | |                             |  |
| +-----------------+ +-----------------------------+  |
+------------------------------------------------------+
```

### 5.4 グループ

```text
+---------------- FILTER ------------------------------+
| <Input: キーワード> [検索]                           |
| <Select: 状態>                                       |
+------------------------------------------------------+
```

---

## 6. 基本 UI 要素

### 6.1 テキスト

```text
"ラベル"
```

### 6.2 ボタン

```text
[保存]
[削除!]
[Button disabled]
```

### 6.3 アイコンボタン

```text
[icon: :menu:]
[icon!: :trash:]
```

### 6.4 入力欄

```text
<Input>
<Input: ユーザー名>
<Input disabled>
```

### 6.5 テキストエリア

```text
<Textarea: 備考>
```

### 6.6 セレクト

```text
<Select: 状態>
<Select: 有効 | 無効>
```

### 6.7 オートコンプリート / コンボボックス

```text
<Combobox: 担当者>
<Autocomplete: 顧客検索>
```

### 6.8 チェックボックス

```text
[ ] 利用規約に同意
[x] メール通知を受け取る
[-] 一部選択
```

### 6.9 ラジオボタン

```text
(o) 有効
( ) 無効
```

### 6.10 スイッチ / トグル

```text
<Toggle: ON>
<Toggle: OFF>
通知設定 <Toggle: ON>
```

### 6.11 スライダー

```text
<Slider: 0..100 value=40>
<RangeSlider: 10..80>
```

### 6.12 レーティング

```text
<Rating: 4/5>
```

### 6.13 タブ

```text
[Tab active: 一覧] [Tab: 詳細] [Tab: 設定]
```

### 6.14 パンくず

```text
<Breadcrumb> [ホーム] / [管理] / "ユーザー一覧" </Breadcrumb>
```

### 6.15 ページネーション

```text
<< < 1 2 3 4 > >>
```

### 6.16 ステッパー

```text
<Stepper: 1.基本情報 -> 2.確認 -> 3.完了>
```

### 6.17 バッジ / チップ / タグ

```text
{success: 有効}
<Chip: 開発中>
<Tag: Tokyo>
```

### 6.18 アバター

```text
<Avatar: 山田太郎>
<Avatar img="user01.png">
```

### 6.19 ツールチップ

```text
<Tooltip: 保存すると確定します>
```

---

## 7. データ表示系

### 7.1 テーブル

```text
|Table|
| ID | 名前 | 状態 | 操作 |
|----|------|------|------|
| 1  | 山田 | 有効 | [編集] |
```

### 7.2 データグリッド

```text
<DataGrid>
 columns: ID | 名前 | 状態 | 更新日
 features: sort, filter, paginate, resize, pin
</DataGrid>
```

### 7.3 リスト

```text
<List>
 - :user: 山田太郎
 - :user: 佐藤花子
</List>
```

### 7.4 説明リスト

```text
<DescriptionList>
 名前: 山田太郎
 状態: 有効
</DescriptionList>
```

### 7.5 カード

```text
<Card>
 タイトル
 説明文
 [詳細]
</Card>
```

### 7.6 アコーディオン

```text
<Accordion>
 [Section: 詳細条件]
</Accordion>
```

### 7.7 ツリー

```text
<Tree>
 - 親
   - 子A
   - 子B
</Tree>
```

### 7.8 タイムライン

```text
<Timeline>
 - 2026-03-01 作成
 - 2026-03-05 承認
</Timeline>
```

### 7.9 カルーセル

```text
<Carousel>
 slide-1 | slide-2 | slide-3
</Carousel>
```

### 7.10 チャート

```text
<Chart: line>
<Chart: bar>
<Chart: pie>
```

---

## 8. フィードバック / オーバーレイ

### 8.1 アラート

```text
<Alert: success> 保存しました
<Alert: warning> 未入力項目があります
<Alert: error> エラーが発生しました
<Alert: info> 参考情報です
```

### 8.2 トースト / スナックバー

```text
<Toast: success> 保存しました
<Snackbar: error> 通信失敗
```

### 8.3 ダイアログ / モーダル

```text
*Modal: 削除確認*
-------------------------
本当に削除しますか？
[キャンセル] [削除!]
-------------------------
```

### 8.4 ドロワー / シート

```text
<Drawer: right>
  [設定]
</Drawer>

<Sheet: bottom>
  "モバイル操作"
</Sheet>
```

### 8.5 ポップオーバー

```text
<Popover>
  "補助操作"
</Popover>
```

### 8.6 メニュー

```text
<Menu>
 - 編集
 - 複製
 - 削除
</Menu>
```

### 8.7 コンテキストメニュー

```text
<ContextMenu>
 - 開く
 - 名前変更
 - 削除
</ContextMenu>
```

---

## 9. ナビゲーション

```text
[Nav: :home: ダッシュボード]
[Nav active: :users: ユーザー]
[Nav: :settings: 設定]
```

```text
<AppBar>
  <SVG: app-logo 120x32>
  [icon: :search:]
  [icon: :bell:]
</AppBar>
```

---

## 10. 日付・時刻・選択系

```text
<DatePicker: 開始日>
<TimePicker: 開始時刻>
<DateTimePicker: 予約日時>
<DateRangePicker: 期間>
<Calendar>
```

```text
<FileUpload>
  [ファイルを選択]
</FileUpload>
```

```text
<PinInput: 6 digits>
```

```text
<ColorPicker>
```

---

## 11. 資産記法

### 11.1 アイコン

```text
:search:
:user:
:settings:
:close:
:warning:
```

### 11.2 SVG / 画像

```text
<SVG: logo>
<SVG: illustration-login 640x240>
<Image: hero-banner 1280x320>
```

状態付き:

```text
<SVG muted: logo>
<SVG decorative: background-wave>
<SVG interactive: node-graph>
```

禁止:

```text
<svg> ... </svg>
```

---

## 12. コンポーネント記法

### 12.1 基本

```text
<Component: SearchBar>
<Component: UserTable>
```

### 12.2 props

```text
<Component: Button variant=primary size=md>
<Component: Badge status=success>
<Component: Modal title="削除確認">
```

### 12.3 インスタンス

```text
<Component#user-search: SearchBar>
<Component#main-table: DataTable>
```

### 12.4 スロット

```text
<Component: Modal>
  <Slot: header> "削除確認" </Slot>
  <Slot: body> "本当に削除しますか？" </Slot>
  <Slot: footer> [キャンセル] [削除!] </Slot>
</Component>
```

---

## 13. 状態記法

```text
<Loading...>
<Skeleton>
<Empty: データがありません>
<Disabled>
<Readonly>
<Selected>
<Focused>
<Hovered>
<Expanded>
<Collapsed>
<Checked>
<Invalid>
<Required>
```

非同期状態:

```text
<Idle>
<Submitting>
<Success>
<Error>
```

---

## 14. レスポンシブ記法

```text
<Breakpoint: mobile>
<Breakpoint: tablet>
<Breakpoint: desktop>
```

例:

```text
<Responsive>
 mobile: <Drawer: left>
 desktop: +---- SIDEBAR ----+
</Responsive>
```

---

## 15. アクセシビリティ注記

```text
<A11y>
 label: "ユーザー検索"
 role: searchbox
 describedby: "検索条件を入力"
 keyboard: tab/enter/esc
</A11y>
```

必要時のみ記述する。

---

## 16. 実用サンプル

```text
+---------------- SCREEN: ユーザー管理 ----------------+

+---------------- HEADER -----------------------------+
| <SVG: app-logo 120x32>              [icon: :bell:] |
| "ユーザー管理"                      [icon: :menu:] |
+----------------------------------------------------+

+---------------- BODY -------------------------------+
| +---- SIDEBAR ----+ +---------------- MAIN -------+ |
| | [Nav: :home: ダッシュボード]                    | |
| | [Nav active: :users: ユーザー]                  | |
| | [Nav: :settings: 設定]                          | |
| +-----------------+ +-----------------------------+ |
|                     | <Component#user-search: SearchBar> |
|                     |   <Input: キーワード>      | |
|                     |   <Select: 状態>          | |
|                     |   [icon: :search:]        | |
|                     | </Component>              | |
|                     |                           | |
|                     | <DataGrid>                | |
|                     |  columns: 名前 | 状態 | 操作 | |
|                     |  features: sort, filter, paginate |
|                     | </DataGrid>               | |
|                     |                           | |
|                     | <Toast: success> 保存しました | |
+----------------------------------------------------+

+---------------- FOOTER -----------------------------+
| "© 2026 Company"                                   |
+----------------------------------------------------+
```

---

## 17. 運用ルール

- 仕様書、PR、レビューコメントで同一記法を使う
- 見た目の完全再現ではなく、構造・役割・状態・操作を優先する
- フレームワーク固有名は必要な場合のみ注記し、本文は中立記法を保つ
- 複雑な画面は「全体レイアウト」→「主要コンポーネント詳細」→「状態差分」の順で記述する
- デザインシステム導入時は、社内コンポーネント名との対応表を別紙で持つ

---

## 18. 対応範囲メモ

本仕様は、一般的な UI ライブラリに見られる以下の類型を表現対象とする。

- layout
- navigation
- form controls
- data display
- feedback
- overlays
- pickers
- icons/assets
- reusable components
- state / responsive / accessibility

---

## 19. 非対象

- ピクセル単位の精密再現
- アニメーションの時系列詳細
- 生SVGや生CSSの完全表現
- 実装コードそのものの代替

---

## 20. 版管理

- v1.2: MUI / Ant Design / Chakra UI / Bootstrap / Radix 系の主要パターンを踏まえ、データグリッド、ピッカー、トースト、ドロワー、ポップオーバー、レスポンシブ、アクセシビリティ記法を追加
