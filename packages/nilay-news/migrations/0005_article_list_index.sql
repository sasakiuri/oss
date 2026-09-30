-- SPDX-License-Identifier: MIT
CREATE INDEX IF NOT EXISTS news_article_list_order ON news_articles(json_extract(data,'$._listOrder') DESC,json_extract(data,'$.discoveredAt') DESC,id ASC);
CREATE INDEX IF NOT EXISTS news_article_posted_url ON news_articles(json_extract(data,'$.url'),json_extract(data,'$.sourceKey'));
CREATE INDEX IF NOT EXISTS news_article_topic ON news_articles(json_extract(data,'$.topic')) WHERE json_extract(data,'$.topic') IS NOT NULL;
