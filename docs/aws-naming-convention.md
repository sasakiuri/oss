# AWS リソース命名規則 v1.2

- 状態: 確定(独立レビュー 1 巡目の critical/major 反映済み)
- 作成日: 2026-08-16
- 適用範囲: 全リポジトリの AWS リソース
- 根拠: 既存リポジトリで実運用中の `${var.project}-${var.environment}-${var.region_code}` プレフィックスを標準として昇格し、観測された表記揺れ(`prod`/`prd`、PascalCase 手動リソース)に裁定を与える
- 本書の例ではプロジェクト名として `nilay` を使用する

## 1. 基本形式

```
{project}-{env}-{region}-{component}[-{qualifier}][-{account_id}]
```

厳密な定義は付録 A の形式文法(ABNF)を正とする。

例:

| リソース        | 名前                                   |
| --------------- | -------------------------------------- |
| ALB             | `nilay-prd-apne1-alb-app`              |
| EC2 (Name タグ) | `nilay-prd-apne1-app`                  |
| RDS             | `nilay-prd-apne1-rds-postgres`         |
| tfstate S3      | `nilay-prd-apne1-tfstate-123456789012` |
| CodeBuild       | `nilay-prd-apne1-build`                |
| IAM ロール      | `nilay-prd-apne1-ec2-app-role`         |

## 2. 各要素の定義

### 2.1 project

- **先頭は英字**、以降は小文字英数字(ハイフン不可 = 1 トークン)。正規表現: `^[a-z][a-z0-9]{0,11}$`
- 先頭英字を必須とするのは、RDS DB 識別子が「先頭文字は英字」を要求するため(名前全体が project で始まる)
- **12 文字以内、8 文字以内を推奨**(§4 の長さバジェットによる)
- 12 文字を超える場合は短縮名を定義して README に対応を記録する(例: `nilaycustomerportal`(19 文字)→ `nilaycp`)
- 例: `nilay`

### 2.2 env(環境コード)— 3 文字固定

| コード | 意味                       |
| ------ | -------------------------- |
| `dev`  | 開発                       |
| `stg`  | 検証(staging)              |
| `prd`  | 本番                       |
| `sbx`  | サンドボックス・実験(任意) |
| `shr`  | 環境横断の共有基盤(任意)   |

**裁定**: `prod` は不採用。`prd` に統一する(3 文字固定でバジェット計算が安定するため)。既存の `prod` リソースは §7 の grandfathering 対象。

### 2.3 region(リージョンコード)— allowlist 管理

リージョンコードは**下表の allowlist で厳密管理**する(正規表現のみの検証は不可)。新リージョン利用時は本表への追記を必須とする。

| AWS リージョン | コード  | 長さ |
| -------------- | ------- | ---- |
| ap-northeast-1 | `apne1` | 5    |
| ap-northeast-3 | `apne3` | 5    |
| ap-southeast-1 | `apse1` | 5    |
| us-east-1      | `use1`  | 4    |
| us-west-2      | `usw2`  | 4    |
| eu-west-1      | `euw1`  | 4    |
| eu-central-1   | `euc1`  | 4    |

- 長さは 4〜5 文字で変動する。**長さバジェット(§4)は実際のコード長で計算し、固定長を仮定しない**(安全側の概算には最長の 5 を使う)
- グローバルサービス(IAM, CloudFront, Route53, `us-east-1` 固定の ACM 等)も、**そのスタックのホームリージョンのコードをそのまま使う**。プレフィックスの一様性(grep 容易性・Terraform 実装の単純さ)を純粋性より優先する。

### 2.4 component(コンポーネント)

リソースの役割を表す標準語彙。`{service}-{role}` の順(例: `ec2-app`, `rds-postgres`, `alb-app`)。

- **各トークンは先頭英字**(`[a-z][a-z0-9]*`)。数字始まりのトークンは禁止(逆解析の一意性のため。付録 A 参照)。数字を含む語は英字を先頭に置く(例: `225labo` → `labo225`)
- 標準語彙(既存資産から採録): `app`, `alb`, `rds-postgres`, `tfstate`, `tfstate-lock`, `build`, `pipeline`, `codedeploy`, `codepipeline-artifact`, `static`, `events`

### 2.5 qualifier(任意)

同種リソースが複数ある場合のみ付与。**必ず数字で始まる 1〜2 文字**とする(逆解析の一意性のため。付録 A 参照):

- 連番: `-1`〜`-9`、2 桁は `-10`〜`-99`(先頭 0 不可)
- AZ サフィックス: 数字 + 英字 1 文字(例: `-1a`, `-1c`)

### 2.6 account_id

**グローバル名前空間を持つリソース(S3 バケットのみ)** に必須。12 桁の AWS アカウント ID を末尾に付与する。それ以外のリソースには付けない。

## 3. 文字種規則

- **全リソース小文字ケバブケース**(`a-z0-9-`)。S3 の制約(小文字必須)に全体を合わせることで、サービス間でのコピー・参照時の変換を不要にする
- ハイフンの連続(`--`)、先頭・末尾ハイフンは禁止(RDS・ALB の制約)
- アンダースコア禁止(RDS 識別子で使用不可のため)
- PascalCase・アンダースコア・ドット区切り(例: `Nilay_Portal-Stg-Apne1-CodeBuild` のような形式)は新規作成では禁止。既存は §7 対象

### 3.1 文字種の明示的例外(この 3 つ以外の例外は認めない)

| 例外                 | 内容                                                                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| CloudWatch Logs      | ロググループ名はスラッシュ区切りパス。AWS 既定グループは `/aws/{service}/{リソース名}` を維持、独自グループは `/{project}/{env}/{component}` |
| KMS エイリアス       | AWS 必須の `alias/` プレフィックスを許可: `alias/{prefix}-{用途}`                                                                            |
| Route53 / ドメイン名 | ドット区切り。ドメイン設計の管轄で本規則の対象外                                                                                             |

## 4. 長さバジェット

名前長の計算式(全サービス共通・1 行で統一):

```
name_len = len(project) + 1 + 3 + 1 + len(region) + 1 + len(component)
           [ + 1 + len(qualifier) ]
           [ + 1 + 12 ]              # S3 のみ (account_id)
```

最も厳しい制約は **ALB / ターゲットグループの 32 文字**。

**component に使える最大文字数**(qualifier なしの場合)。`prefix_len = len(project) + 1 + 3 + 1 + len(region)`(例: `nilay-prd-apne1` = 15 文字):

| 制約リソース             | 名前上限 | component 上限の式         | 例: project=nilay(5), region=apne1 |
| ------------------------ | -------- | -------------------------- | ---------------------------------- |
| ALB / ターゲットグループ | 32       | `32 - prefix_len - 1`      | 16 文字                            |
| S3(account_id 含む)      | 63       | `63 - prefix_len - 1 - 13` | 34 文字                            |
| RDS 識別子               | 63       | `63 - prefix_len - 1`      | 47 文字                            |
| IAM ロール               | 64       | `64 - prefix_len - 1`      | 48 文字                            |
| Lambda                   | 64       | `64 - prefix_len - 1`      | 48 文字                            |
| CodePipeline             | 100      | `100 - prefix_len - 1`     | 84 文字                            |

- 安全側の概算では region に最長 5 文字を仮定してよいが、**CI 検証(§8)は実値で行う**
- ALB/TG のみ、バジェット超過時は component の短縮を許可(例: `alb-app` → `alb`)。短縮の対応は Terraform の locals にコメントで記録する

## 5. サービス別規則

**デフォルト規則**: 下表にないサービスは `{prefix}-{component}`(name 属性が無いものは Name タグ)を適用する。新しいサービス種別を使う PR では、固有制約(文字数・文字種)を確認して本表に行を追加すること(§8 の names マップに追加すると CI で長さ検証される)。

| サービス                                 | 規則                                                                                                                                                                 |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S3                                       | `{prefix}-{component}-{account_id}`。account_id 必須                                                                                                                 |
| IAM ロール                               | `{prefix}-{principal}-{role}-role`(例: `-ec2-app-role`, `-codepipeline-role`)。新規は `-role` サフィックス必須(ロール/ポリシー/インスタンスプロファイルの識別のため) |
| IAM ポリシー                             | `{prefix}-{対象}-policy`                                                                                                                                             |
| IAM インスタンスプロファイル             | 対応するロール名から `-role` を `-profile` に置換                                                                                                                    |
| IAM ユーザー                             | `{prefix}-{用途}-user`(機械ユーザーのみ。人間用は SSO/IdP 管轄で対象外)                                                                                              |
| EC2                                      | Name タグ = `{prefix}-{component}`。CodeDeploy の `ec2_tag_filter` と完全一致させる                                                                                  |
| VPC / Subnet / SG 等 name 属性の無いもの | Name タグに同一規則。Subnet は `-public-1a` 等の qualifier 必須                                                                                                      |
| RDS                                      | 識別子 = `{prefix}-rds-{engine}`。DB 名・ユーザー名は命名規則の対象外(アプリ設定で管理)                                                                              |
| DynamoDB                                 | `{prefix}-{component}`                                                                                                                                               |
| Lambda                                   | `{prefix}-{function役割}`                                                                                                                                            |
| ECR                                      | `{prefix}-{component}`(小文字必須なので追加変換不要)                                                                                                                 |
| KMS エイリアス                           | `alias/{prefix}-{用途}`(§3.1 の例外)                                                                                                                                 |
| CloudWatch Logs                          | §3.1 の例外規則に従う                                                                                                                                                |
| CodeBuild / CodePipeline / CodeDeploy    | `{prefix}-build` / `{prefix}-pipeline` / `{prefix}-codedeploy`                                                                                                       |
| SNS                                      | `{prefix}-{topic用途}`                                                                                                                                               |
| CloudFront / ACM                         | name 属性なし。Name タグに `{prefix}-{component}`                                                                                                                    |
| Route53                                  | §3.1 の例外。ゾーンコメントに project を記載                                                                                                                         |

## 6. タグ規則(名前の補完)

名前に載せない情報はタグで持つ。全リソース必須タグ:

| タグ          | 値                     |
| ------------- | ---------------------- |
| `Project`     | project 値             |
| `Environment` | env 値                 |
| `ManagedBy`   | `terraform` / `manual` |
| `Repository`  | ソースリポジトリ名     |

default_tags(AWS provider)で一括付与し、個別リソースでは Name タグのみ書く。

## 7. 既存リソースの扱い(grandfathering)

- **既存リソースのリネームは行わない**(S3・RDS 等は再作成となり破壊的なため)
- 非準拠の既存リソース(`prod` 系、PascalCase 手動リソース、規則性のないレガシー命名)は「例外台帳」に列挙し、各リポジトリの terraform README に節を設ける
- 例外リソースにも §6 のタグは付与し、タグレベルでは統一する
- リプレイス・再作成の機会があれば新規則に移行する

## 8. Terraform 実装規約

- `name_prefix` の定義は**共有 module または各環境 1 箇所の locals に集約**し、環境間で重複コピーしない
- region_code は allowlist マップで検証し、正規表現のみの検証はしない

```hcl
locals {
  # §2.3 の allowlist。新リージョンはここに追記する
  region_codes = {
    "ap-northeast-1" = "apne1"
    "ap-northeast-3" = "apne3"
    "us-east-1"      = "use1"
  }
  region_code = local.region_codes[var.aws_region] # 未登録リージョンはここで fail

  name_prefix = "${var.project}-${var.environment}-${local.region_code}"

  # このスタックで命名するリソースの一覧。ここに追加すると下の check で長さ検証される
  names = {
    alb        = { value = "${local.name_prefix}-alb-app", limit = 32 }
    tg         = { value = "${local.name_prefix}-tg-app", limit = 32 }
    rds        = { value = "${local.name_prefix}-rds-postgres", limit = 63 }
    s3_tfstate = { value = "${local.name_prefix}-tfstate-${local.account_id}", limit = 63 }
    build      = { value = "${local.name_prefix}-build", limit = 255 }
  }
}

variable "project" {
  type = string
  validation {
    condition     = can(regex("^[a-z][a-z0-9]{0,11}$", var.project))
    error_message = "project must start with a letter, lowercase alphanumeric, max 12 chars"
  }
}

variable "environment" {
  type = string
  validation {
    condition     = contains(["dev", "stg", "prd", "sbx", "shr"], var.environment)
    error_message = "environment must be one of: dev, stg, prd, sbx, shr"
  }
}

# 全命名リソースの長さを一括検証(個別ハードコードの check は書かない)
check "name_lengths" {
  assert {
    condition = alltrue([
      for k, n in local.names : length(n.value) <= n.limit
    ])
    error_message = "resource name exceeds its service limit; see local.names"
  }
}
```

## 9. 検証方法

- 使用リソース種別は策定時点の全リポジトリ `*.tf` の `resource "aws_*"` 走査結果を §5 の表 + デフォルト規則でカバー。未列挙の新サービスは §5 のデフォルト規則 + 表追加プロセスで扱う
- 長さ制約は §4 の式で機械検証可能。§8 の `local.names` + `check` ブロックで CI 強制(実値ベース、固定長仮定なし)
- 既存プレフィックス互換: §1 は既存 Terraform 実装の `local.name_prefix` と同一形式

## 付録 A: 形式文法(ABNF)

RFC 5234 の ABNF で通常リソース名を定義する。本文(§1〜§5)と齟齬がある場合は本付録を正とする。

```abnf
resource-name = prefix "-" component [ "-" qualifier ] [ "-" account-id ]

prefix        = project "-" env "-" region

project       = LC-ALPHA *11LC-ALNUM   ; 1〜12 文字、先頭は英字 (§2.1)
env           = "dev" / "stg" / "prd" / "sbx" / "shr"          ; §2.2
region        = "apne1" / "apne3" / "apse1"                    ; §2.3 allowlist
              / "use1" / "usw2" / "euw1" / "euc1"              ; (追記はここと §2.3 を同時に)

component     = token *( "-" token )   ; §2.4 の標準語彙に一致すること (側条件 S1)
qualifier     = ordinal / az           ; §2.5 — 必ず数字始まり・1〜2 文字
ordinal       = NZ-DIGIT [ DIGIT ]     ; "1"〜"9", "10"〜"99"
az            = NZ-DIGIT LC-ALPHA      ; 例: "1a", "1c"
account-id    = 12DIGIT                ; §2.6 (S3 のみ、側条件 S2)

token         = LC-ALPHA *LC-ALNUM     ; 先頭英字 (§2.4) — 一意解析の要
LC-ALPHA      = %x61-7A                ; a-z
NZ-DIGIT      = %x31-39                ; 1-9
LC-ALNUM      = LC-ALPHA / DIGIT
DIGIT         = %x30-39
```

§3.1 の例外リソース:

```abnf
kms-alias     = "alias/" prefix "-" component
log-group     = "/aws/" 1*( LC-ALNUM / "-" / "/" )             ; AWS 既定グループ
              / "/" project "/" env "/" component              ; 独自グループ
```

### 側条件(文脈依存のため文法では表現しない)

| #   | 条件                                                                           |
| --- | ------------------------------------------------------------------------------ |
| S1  | `component` は §2.4 の標準語彙(またはサービス別規則 §5 が定める形)に一致する   |
| S2  | `account-id` は S3 バケットでは必須、S3 以外では禁止                           |
| S3  | 名前全長はサービス別上限(§4)以内                                               |
| S4  | IAM は §5 のサフィックス規則(`-role` / `-policy` / `-profile` / `-user`)に従う |

### 逆解析の一意性

名前をハイフンで分割したとき、各要素の文字クラスは**互いに素**である:

| 要素                                            | 文字クラス          |
| ----------------------------------------------- | ------------------- |
| project / env / region / component の各トークン | 先頭英字            |
| qualifier                                       | 先頭数字、1〜2 文字 |
| account-id                                      | 数字ちょうど 12 桁  |

したがって次のアルゴリズムで逆解析は**一意に定まる**:

1. `-` で分割する
2. 先頭 3 トークンを `project` / `env` / `region` とする(env・region は閉集合との一致を検証)
3. 末尾トークンが数字 12 桁なら `account_id` として取り除く
4. 末尾トークンが数字始まり(1〜2 文字)なら `qualifier` として取り除く
5. 残り全部が `component`(全トークン先頭英字であることを検証)

数字始まりのトークンは qualifier / account-id にしか現れず、両者は長さ(≤2 と =12)で区別されるため、どの分割位置にも二通りの読みは存在しない。

### CI 用の等価正規表現

通常リソース名(qualifier・account_id 含む全体、側条件 S1/S2 は別途チェック)。名前付きグループ付きで、マッチすれば各要素がそのまま取れる:

```
^(?P<project>[a-z][a-z0-9]{0,11})-(?P<env>dev|stg|prd|sbx|shr)-(?P<region>apne1|apne3|apse1|use1|usw2|euw1|euc1)-(?P<component>[a-z][a-z0-9]*(-[a-z][a-z0-9]*)*)(-(?P<qualifier>[1-9][0-9]|[1-9][a-z]|[1-9]))?(-(?P<account_id>[0-9]{12}))?$
```

ハイフン連続・先頭末尾ハイフン(§3)は文法上発生しない(トークンは 1 文字以上で、ハイフンは区切りのみ)。文字クラスが互いに素なため、この正規表現のマッチも一意である。

## 改訂履歴

| 版         | 日付       | 変更                                                                                                                                                                                                                     |
| ---------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| v1.0 draft | 2026-08-16 | 初版。既存実装の標準化 + 揺れの裁定                                                                                                                                                                                      |
| v1.0 rc1   | 2026-08-16 | 独立レビュー指摘反映: project 先頭英字必須、region allowlist 化と実値長計算、S3 バジェット式の明確化、§5 デフォルト規則追加、check ブロックの汎用化、§3.1 例外の明文化                                                   |
| v1.0       | 2026-08-16 | 確定。具体プロジェクト名を除去し例を `nilay` に統一、§4 バジェット表の off-by-one を修正                                                                                                                                 |
| v1.1       | 2026-08-16 | 付録 A(ABNF 形式文法・側条件・CI 用正規表現)を追加し、付録を正とする旨を §1 に明記                                                                                                                                       |
| v1.2       | 2026-08-16 | 逆解析を一意化: component トークンは先頭英字必須、qualifier は先頭数字 1〜2 文字(連番を 99 まで拡張)、account_id は 12 桁固定。文字クラスの互いに素性による一意解析アルゴリズムと名前付きグループ正規表現を付録 A に追加 |
