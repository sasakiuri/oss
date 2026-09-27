-- SPDX-License-Identifier: MIT
-- D1 schema is independent from the retired daemon's local database format.
CREATE TABLE IF NOT EXISTS news_meta (
    id INTEGER PRIMARY KEY CHECK (id = 1), revision INTEGER NOT NULL,
    token TEXT NOT NULL
);
INSERT OR IGNORE INTO news_meta VALUES (1, 0, '');
CREATE TABLE IF NOT EXISTS news_articles (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS news_article_identity
    ON news_articles(json_extract(data, '$._identity'));
CREATE INDEX IF NOT EXISTS news_article_discovered
    ON news_articles(json_extract(data, '$.discoveredAt'));
CREATE TABLE IF NOT EXISTS news_sources (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS news_posts (
    id TEXT PRIMARY KEY REFERENCES news_articles(id), data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS news_post_expiry ON news_posts(
    json_extract(data, '$.status'), json_extract(data, '$.claim_expires_at')
);
CREATE INDEX IF NOT EXISTS news_post_check ON news_posts(
    json_extract(data, '$.status'), json_extract(data, '$.check_at')
);
CREATE TABLE IF NOT EXISTS news_state (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS news_records (
    namespace TEXT NOT NULL, key TEXT NOT NULL, data TEXT NOT NULL,
    expires REAL, PRIMARY KEY(namespace, key)
);
CREATE TABLE IF NOT EXISTS news_host_leases (
    host TEXT PRIMARY KEY, token TEXT NOT NULL, expires REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS news_blobs (
    key TEXT NOT NULL, part INTEGER NOT NULL, data TEXT NOT NULL,
    expires REAL, created REAL NOT NULL, PRIMARY KEY(key, part)
);
CREATE INDEX IF NOT EXISTS news_blob_expiration ON news_blobs(expires);
