-- =====================================================
-- Supabase マイグレーション用 SQL
-- テーブル: news (お知らせ)
-- Firestore からのデータ移行
-- =====================================================

-- nanoid 生成関数 (21文字のURL-safe ID)
-- Firestoreの20文字IDと同様のフォーマット
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION generate_nanoid(size INT DEFAULT 21)
RETURNS TEXT AS $$
DECLARE
  alphabet TEXT := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  id TEXT := '';
  i INT;
  bytes BYTEA;
BEGIN
  bytes := gen_random_bytes(size);
  FOR i IN 0..size-1 LOOP
    id := id || substr(alphabet, (get_byte(bytes, i) % 62) + 1, 1);
  END LOOP;
  RETURN id;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- テーブル作成 (Prisma migrate で作成済みの場合は不要)
CREATE TABLE IF NOT EXISTS news (
  id TEXT PRIMARY KEY DEFAULT generate_nanoid(20),
  title VARCHAR(200) NOT NULL,
  summary TEXT NOT NULL,
  date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- インデックス (日付での検索・ソート用)
CREATE INDEX IF NOT EXISTS idx_news_date ON news(date DESC);

-- =====================================================
-- Firestore からの初期データ (9件)
-- =====================================================
INSERT INTO news (id, title, summary, date, created_at, updated_at) VALUES
  ('9HxUJ3aSPnSBXVbKFGZm', 'サーバーメンテナンスのお知らせ', '<p>2/22 3：00～4:00 にメールサーバーとデータベースサーバーのメンテナンスを実施いたします。メンテナンスの間は一部サービスがご利用いただけません。ご迷惑をおかけしますがよろしくお願いいたします。</p>', '2021-02-16T15:00:00.000Z', NOW(), NOW()),
  ('ocC270l1tMVNlQ4UOTYH', '通販サイトの一部決済方法において発生していた不具合について', '<p>通販サイトの一部決済方法において、決済会社の決済から戻った際にエラーが発生してしまう場合がありましたが、現在は修正されております。この度はご迷惑をおかけして申し訳ありませんでした。</p> <h2>原因</h2> <p>データベース管理システムのアップグレード時に設定を誤ったことで、データベース・サーバーとウェブ・サーバーの時刻に差異が生じていたため、バッチ処理が正常に動作せずデータの不整合が生じたため不具合が発生しました。</p> <h2>対策</h2> <p>アップグレード時の設定確認を徹底いたします。</p>', '2020-11-10T15:00:00.000Z', NOW(), NOW()),
  ('tWq9DheYHnIlxkGymvbB', '自宅練習用の標的を計算するツールの公開のお知らせ', '<p>標的の高さと黒丸の大きさを計算するツールを作成しました。自宅での練習等にご活用ください。※印刷時には「実際のサイズ」をご指定ください。</p> <p><a href="https://about.nilay.jp/labs/home-target">https://about.nilay.jp/labs/home-target</a></p>', '2020-05-18T10:00:00.000Z', NOW(), NOW()),
  ('im344vmrdL7lvFtX04Le', '申請書作成サービスリニューアルのお知らせ', '<p>申請・申込書作成サービスをリニューアルいたしました。作成サービスは <a href="https://www.gunman.jp" target="_blank" rel="noopener noreferrer">https://www.gunman.jp</a> からご利用いただけます。サービスのご利用にはＥメールアドレスのご登録が必要です。</p>', '2020-02-18T15:00:00.000Z', NOW(), NOW()),
  ('pXz2MUh1EtmZMwm96HMJ', '新年のご挨拶', '<p>新年あけましておめでとうございます。</p> <p>旧年中は格別のご愛顧を賜り、厚く御礼申し上げます。</p> <p>本年はさらなるサービスの向上に努めて参りますので、よろしくお願いいたします。</p> <ul> <li>商品ラインナップの追加</li> <li>表示速度の改善</li> <li>UI/UX の改善</li> <li>申請書作成サービスのリニューアル</li> </ul>', '2019-12-31T15:00:00.000Z', NOW(), NOW()),
  ('6puua1RohZxrHBhtodfh', 'ラインナップ追加のお知らせ', '<p>弾頭・薬きょうなどをラインナップに追加いたしました。</p>', '2019-12-03T15:00:00.000Z', NOW(), NOW()),
  ('NdaST6A4Ivlj6bhUN3Dz', '後払い（コンビニ・郵便局・銀行）でお支払いいただけます', '<p>支払方法に後払い（コンビニ・郵便局・銀行）を追加いたしました。ご利用の場合は請求書発行費用として、209円 (税込) の手数料が発生いたします。<br><a href="https://www.nilay.jp/payment_delivery/" target="_blank">https://www.nilay.jp/payment_delivery/</a></p>', '2019-11-21T15:00:00.000Z', NOW(), NOW()),
  ('1HgdWZqvbZe5lJGvGRjl', 'ご利用可能な支払方法に代引を追加しました', '<p>支払方法に代金引換を追加いたしました。代金引換を選択された場合は、410円 (税込) の手数料がかかります。</p>', '2019-10-23T15:00:00.000Z', NOW(), NOW()),
  ('py1wEA7ji4LDkwiU40o6', 'About サイトを作成しました', '<p>特に必要ないのですが作ってみました。</p>', '2019-09-18T15:00:00.000Z', NOW(), NOW());

-- =====================================================
-- updated_at 自動更新トリガー
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_news_updated_at ON news;
CREATE TRIGGER update_news_updated_at
  BEFORE UPDATE ON news
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 新規追加例 (ID は自動生成されます)
-- =====================================================
-- INSERT INTO news (title, summary, date) VALUES
--   ('新しいお知らせ', '<p>お知らせの本文です。</p>', '2024-01-01T00:00:00.000Z');
--
-- または日付も省略 (現在時刻が使用されます):
-- INSERT INTO news (title, summary) VALUES
--   ('新しいお知らせ', '<p>お知らせの本文です。</p>');
