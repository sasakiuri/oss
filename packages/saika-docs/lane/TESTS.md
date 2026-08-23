<!-- SPDX-License-Identifier: MIT -->

# Saika Lane テストシナリオ

> 移植元で管理されていた回帰シナリオの一部です。自動テストの完全な一覧ではありません。テスト追加時は「操作 → 期待」の形式で追記します。

---

## 書き方

```
### シナリオ名

**操作:**
1. 〇〇画面を開く
2. △△を「値」にする
3. 保存する
4. アプリを再起動する

**期待:**
- □□が「値」になっている
```

---

## Lane Number 永続化 (2026-02-17)

### 設定画面で変更した Lane Number が再起動後も保持される

**操作:**

1. 設定画面の General タブを開く
2. Lane Number を「5」にして保存する
3. アプリを再起動する

**期待:**

- Lane Number が「5」になっている

---

### Lane Number、競技種別、接続設定が再起動後も保持される

**操作:**

1. General タブで Lane Number を「3」にして保存する
2. Target タブで「10m Air Rifle 60 shots」を選択する
3. Connection タブで対応するポートと「DISAG RedDot Rifle」を選択して接続する
4. アプリを再起動する

**期待:**

- Lane Number が「3」になっている
- 競技種別が「10m Air Rifle 60 shots」、種目が「10m Air Rifle」になっている
- 前回のメーカー、装置、ポートが Connection タブへ復元される

---

### Lane Number を変更し直すと最新の値が使われる

**操作:**

1. Lane Number を「1」で保存する
2. Lane Number を「7」で保存する
3. アプリを再起動する

**期待:**

- Lane Number が「7」になっている

---

### Lane Number と競技種別をそれぞれ保存・復元できる

**操作:**

1. General タブで Lane Number を「5」にして保存する
2. 設定画面を開き直し、Target タブで「10m Air Pistol 60 shots」を選択する
3. アプリを再起動する

**期待:**

- Lane Number が「5」になっている
- 競技種別が「10m Air Pistol 60 shots」、種目が「10m Air Pistol」になっている

---

### 初回起動時はデフォルト値が使われる

**操作:**

1. アプリを初めて起動する（設定データなし）

**期待:**

- Lane Number が「1」（デフォルト）
- 保存済み競技種別がないため「10m Beam Rifle 60 shots standing」で開始する
- エラーは出ない

---

### Lane Number だけ保存して競技種別はデフォルトのまま

**操作:**

1. Lane Number を「3」にして保存する（Target タブでは選択しない）
2. アプリを再起動する

**期待:**

- Lane Number が「3」になっている
- 「10m Beam Rifle 60 shots standing」で開始する

---

### 設定の読み込み中にアプリを閉じても壊れない

**操作:**

1. アプリを起動する
2. 設定の読み込みが終わる前にアプリを閉じる

**期待:**

- 次回起動時に正常に動作する

---

### 接続したことがない場合でも設定画面の値は復元される

**操作:**

1. 設定画面の General タブで Lane Number を「3」にして保存する
2. Connection タブでは一度も接続しない
3. アプリを再起動する

**期待:**

- Lane Number が「3」になっている（General タブの保存値から復元される）
