<!-- SPDX-License-Identifier: MIT -->

# Saika Lane — HISTORY

Saika Lane の実装変更履歴。アーキテクチャリファクタリングの記録を中心に記載する。

> これは移植元リビジョン時点の履歴スナップショットである。件数やファイル構成は現在の実装と異なる場合がある。

---

## Round 5: 保守性・拡張性リファクタリング (2026-02-18)

**目的**: テストカバレッジ拡充、型安全性改善、マジックナンバー定数化、TargetDevice レジストリ化

**成果**:

| サブフェーズ | 内容                                              | テスト増 |
| ------------ | ------------------------------------------------- | -------- |
| R5-A         | テストファクトリ基盤 + createServiceMethod テスト | +18      |
| R5-B         | IpcRouter + ModuleLoader テスト                   | +22      |
| R5-C         | ContractEventForwarder テスト                     | +23      |
| R5-D         | 型安全性改善 + マジックナンバー定数化             | -        |
| R5-E         | Renderer サービス + フックテスト                  | +51      |
| R5-F         | Renderer コンポーネントテスト                     | +48      |
| R5-G         | TargetDevice レジストリ化 + エラーパスカバレッジ  | +15      |

**定量結果**:

| メトリクス            | Before | After         |
| --------------------- | ------ | ------------- |
| テスト数              | 1930   | 2103 (+173)   |
| tsc エラー            | 0      | 0             |
| lint エラー           | 0      | 0             |
| `as any` (src内)      | 1      | 0             |
| ESLint-disable (不正) | 2      | 0             |
| マジックナンバー      | 10+    | 0             |
| TargetDevice.ts 行数  | 403    | 130 (68%削減) |

**主な変更**:

- **テストファクトリ基盤**: `factories.ts` (Shot/Session/ImpactPoint/Score), `mockElectronAPI.ts` (再利用可能なElectron APIモック)
- **共有インフラテスト**: IpcRouter (command/query/validation/error), ModuleLoader, ContractEventForwarder (13イベント forward)
- **型安全性**: `as any` → `Record<string, unknown>`, `typedKeys()` ヘルパー導入, `Array.from` 型推論, ESLint-disable 解消 (useRef パターン)
- **マジックナンバー定数化**: TimerDisplay, SeriesScoreGrid, TargetRingRenderer, TargetDisplay, scoreUtils
- **TargetDevice レジストリ化**: `targetDeviceDefinitions.ts` にデバイス定義データ抽出, Map ルックアップ, 403→130行
- **Renderer テスト**: サービス3件 (competition/report/window) + フック5件 (connectionSetup/connectionEvents/shotEvents/sessionEvents/audioPlayback) + コンポーネント4件 (SideMenu/PortSelector/DeviceSelector/StatusBar)
- **エラーパスカバレッジ**: CompetitionState 不正状態遷移10パターン, TargetDevice レジストリ整合性5件

---

## Round 6: コード品質・テストカバレッジ強化 (2026-02-18)

**目的**: 構造改善（AdapterRegistry 抽出）、エラーパターン統一、テスト大幅拡充

**成果**:

| サブフェーズ | 内容                                                               | テスト増 |
| ------------ | ------------------------------------------------------------------ | -------- |
| R6-A         | DataConversionService → AdapterRegistry 抽出 (295→90行, 69%削減)   | +22      |
| R6-B         | target.module.ts にレジストリ初期化移動 (ServiceRegistry 統合)     | -        |
| R6-C         | Timer.ts ErrorCatalog パターン統一 (INVALID_TIMER_DURATION追加)    | +7       |
| R6-D         | IPC Contract DSL + Schema テスト                                   | +58      |
| R6-E         | エラーカタログ整合性 + toIpcError テスト                           | +56      |
| R6-F         | モジュール初期化テスト (全6モジュール + mockDependencies ヘルパー) | +65      |
| R6-G         | ロギング + Preload ブリッジテスト                                  | +53      |
| R6-H         | アダプタースタブ + ズーム + ストレージテスト                       | +35      |
| R6-I         | 印刷系コンポーネント + Report テスト                               | +26      |
| R6-J         | SPEC.md + CLAUDE.md 更新                                           | -        |

**定量結果**:

| メトリクス       | Before | After       |
| ---------------- | ------ | ----------- |
| テスト数         | 2103   | 2382 (+279) |
| テストファイル数 | 129    | 162 (+33)   |
| tsc エラー       | 0      | 0           |
| lint エラー      | 0      | 0           |

**主な変更**:

- **AdapterRegistry 抽出**: `DataConversionService` からアダプター管理責務を分離。`AdapterRegistry` は空コンストラクタで、`target.module.ts` の `register()` でアダプター登録を行うように変更
- **ErrorCatalog パターン統一**: `Timer.ts`、`CompetitionErrors` カタログの統一
- **共通テストヘルパー**: `mockDependencies.ts` (CommandBus/QueryBus/EventBus/IpcRouter/各Repository/USBManager/Storage 等のモックファクトリ)
- **モジュール初期化テスト**: 全6モジュール (session/connection/target/settings/competition/report) の register() テスト。CQRS ハンドラー登録、IPC ルーティング、イベント購読を検証
- **ロギング + Preload テスト**: Logger/IpcLogger/createLogger のシングルトン・レベル制御。createBridge/createEventBridge/buildPreloadAPI のコントラクトブリッジ生成
- **IPC Contract DSL テスト**: defineContract/defineEventContract/command/query の DSL 構造。全6コントラクトの Zod スキーマバリデーション
- **エラーカタログテスト**: 全6カタログ49コードの整合性検証。toIpcError の DomainError/一般エラー変換

---

## Round 7: コード品質・保守性改善 (2026-02-18)

**目的**: エラーハンドリング統一、モジュール責務分離、Renderer DRY化、コンポーネント分解、パフォーマンス改善

**成果**:

| サブフェーズ | 内容                                                                                                           | テスト増 |
| ------------ | -------------------------------------------------------------------------------------------------------------- | -------- |
| T1-A         | `isDomainError()` 型ガード抽出 (4箇所のインラインパターン統一)                                                 | +10      |
| T1-B         | plain `Error()` → `ErrorCatalog.createError()` 統一                                                            | +5       |
| T1-C         | `console.log` のロガー (`getLogger()`) 統一                                                                    | -        |
| T2-A         | `connection.module.ts` IPC ハンドラー + ショット取り込み抽出 (`ConnectionIpcHandlers`, `ShotIngestionHandler`) | +15      |
| T2-B         | `SessionContextCache` 抽出 (connection/infra → 専用キャッシュクラス)                                           | +8       |
| T2-C         | `competition.module.ts` イベントハンドラー抽出 (`CompetitionEventHandlers`)                                    | +12      |
| T3-A         | `useAsyncAction` パターン抽出 (非同期操作の loading/error 統一)                                                | +10      |
| T3-B/C/D     | `useSession`/`useCompetition`/`useConnection` リファクタ (useAsyncAction 適用)                                 | +15      |
| T4-A         | `Modal.tsx` useEffect 分解 (`useEscapeKey`/`useFocusTrap`/`useBodyScrollLock`) — 191→74行                      | +17      |
| T4-B         | `SideMenu.tsx` の `SideMenuButton` 抽出                                                                        | +8       |
| T4-C         | `ScoreSheet.tsx` 計算ロジック抽出 (`scoreSheetUtils.ts`)                                                       | +15      |
| T5-A         | `React.memo` 適用 (`TargetDisplay`/`ShotHistory`/`SeriesScoreGrid`)                                            | -        |
| T5-B         | `GetScoreSheetHandler` の型アサーション除去                                                                    | +10      |

**定量結果**:

| メトリクス       | Before | After       |
| ---------------- | ------ | ----------- |
| テスト数         | 2382   | 2507 (+125) |
| テストファイル数 | 162    | 173 (+11)   |
| tsc エラー       | 0      | 0           |
| lint エラー      | 0      | 0           |

**主な変更**:

- **isDomainError 型ガード**: `error instanceof Error && 'code' in error` を `isDomainError(error)` に統一。`src/shared/errors/isDomainError.ts`
- **Main モジュール責務分離**: `connection.module.ts` から IPC ハンドラー (`ConnectionIpcHandlers`)、ショット取り込み (`ShotIngestionHandler`)、セッションコンテキストキャッシュ (`SessionContextCache`) を抽出。`competition.module.ts` からイベントハンドラー (`CompetitionEventHandlers`) を抽出
- **useAsyncAction パターン**: 非同期操作の loading/error 状態管理を統一フックに集約。`useSession`/`useCompetition`/`useConnection` で採用
- **Modal useEffect 分解**: 4つの useEffect を 3つの再利用可能フック (`useEscapeKey`/`useFocusTrap`/`useBodyScrollLock`) に分解
- **SideMenuButton 抽出**: `SideMenu.tsx` からボタンコンポーネントを分離
- **ScoreSheet 計算ロジック抽出**: `ScoreSheet.tsx` からスコア計算を `scoreSheetUtils.ts` に分離
- **React.memo 適用**: `TargetDisplay`/`ShotHistory`/`SeriesScoreGrid` に memo 適用で不要な再描画を防止
- **エラーハンドリング統一**: plain `Error()` → `ErrorCatalog.createError()` への移行、`console.log` → `getLogger()` への統一
