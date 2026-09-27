-- SPDX-License-Identifier: MIT
-- Jobs record whether the scheduler queued them. Existing analysis jobs were manual.
-- Every other field of the job, including a running job's lease and progress, is kept.
UPDATE news_state SET data=json_set(data, '$.automatic', json('false'))
    WHERE id='job';
-- Invalidate cached state and in-flight optimistic mutations of the old job.
UPDATE news_meta SET revision=revision+1
    WHERE id=1 AND EXISTS (SELECT 1 FROM news_state WHERE id='job');
