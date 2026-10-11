-- SPDX-License-Identifier: MIT
-- Keys of deleted articles: the ID each of their identities derives, so
-- collection never adds a deleted story again.
CREATE TABLE IF NOT EXISTS news_removed_articles (id TEXT PRIMARY KEY) WITHOUT ROWID;
