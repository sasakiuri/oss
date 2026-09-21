# microCMS のニュース管理

`news` はリスト形式の API です。[news-api.json](news-api.json) がフィールド定義です。
マネジメント API の `POST /api/v1/apis` にこの JSON を送信して作成できます。
既存 API は置き換えず、フィールドとコンテンツを確認してから移行してください。

| 項目          | 内容                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------ |
| コンテンツ ID | `/news/{id}` の URL に使います。公開後は変更しません。                                     |
| `title`       | ニュースのタイトル。必須です。                                                             |
| `date`        | サイトに表示する掲載日時。必須です。予約公開日時とは別の項目です。                         |
| `summary`     | リッチエディタで編集する本文。必須です。段落・見出し・リスト・リンク・画像などが使えます。 |

## 接続設定

サーバーに `MICROCMS_SERVICE_DOMAIN` と `MICROCMS_API_KEY` を設定します。
サービスドメインは `https://example.microcms.io` の `example` 部分です。
ローカルではパッケージの `.env.local`、Vercel ではプロジェクトの環境変数に保存します。
API キーは `NEXT_PUBLIC_` 変数に入れません。

本番用キーには `news` の GET 権限だけを付与し、「下書き全取得」と「公開終了コンテンツの全取得」を両方無効にします。
移行に使った PUT・マネジメント API の権限は、本番で使うキーから外します。
環境変数の変更をデプロイへ反映するには、Vercel で再デプロイしてください。

## 編集と公開

microCMS 管理画面の「ニュース」でタイトル・掲載日時・本文を入力し、公開します。
下書きと公開終了した記事はサイトには掲載しません。
予約公開は microCMS の公開設定を使います。`date` に未来の日時を設定するだけでは予約公開になりません。

アプリは公開コンテンツを `date` の降順、同じ掲載日時では作成日時の降順に取得します。
サーバーでは独自の本文キャッシュを使いません。microCMS 側の配信キャッシュや開いている画面の状態によっては、公開後に再読み込みが必要です。

## 既存ニュースの移行

移行元をバックアップし、新しいコンテンツ ID で `title`・`date`・`summary` を登録します。
今回の移行では、サービスの50文字固定設定に合わせた ID を生成し、PUT API で登録します。
再実行で重複しないよう、移行前に ID の対応表を保存し、登録済みの記事は内容を照合します。
元 DB の ID を使った URL の互換性は維持しません。サイトは microCMS の新しい ID を使います。
記事ごとの HTML、リンク先、掲載日時を照合してから本番を切り替えます。

リッチエディタは対応する HTML だけを取り込み、属性や空白を正規化することがあります。
文字列の差分だけでなく、段落・見出し・リスト・リンクの内容も確認してください。
microCMS のシステム項目 `createdAt`・`updatedAt` は CMS での作成・更新時刻になります。
元 DB の `created_at`・`updated_at` はバックアップに保持します。

## 参照

- [API の作成](https://document.microcms.io/management-api/post-apis)
- [ID を指定したコンテンツの登録](https://document.microcms.io/content-api/put-content)
- [コンテンツ ID の設定](https://document.microcms.io/manual/content-id-setting)
- [リッチエディタの HTML 取り込み](https://document.microcms.io/manual/rich-editor-write-api)
