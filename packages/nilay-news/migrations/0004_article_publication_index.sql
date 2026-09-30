-- SPDX-License-Identifier: MIT
CREATE INDEX IF NOT EXISTS news_article_publication_index_version
    ON news_articles(json_extract(data, '$._publicationIndex'), id);
CREATE INDEX IF NOT EXISTS news_article_pending_publication
    ON news_articles(json_extract(data, '$.analysisStatus'),
        json_extract(data, '$._publicationSeconds') DESC,
        json_extract(data, '$.discoveredAt') DESC, id ASC);
