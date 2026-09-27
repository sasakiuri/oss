-- SPDX-License-Identifier: MIT
-- Automatic Jev classification is a separate paid opt-in, disabled for existing settings.
-- A fresh database has no settings row yet, and the Worker creates it disabled.
UPDATE news_state SET data=json_set(data, '$.autoAnalyze', json('false'))
    WHERE id='settings';
-- Invalidate cached state and in-flight optimistic mutations of the old settings.
UPDATE news_meta SET revision=revision+1
    WHERE id=1 AND EXISTS (SELECT 1 FROM news_state WHERE id='settings');
