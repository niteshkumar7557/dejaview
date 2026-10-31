-- 002_job_chain_and_titles.sql
--
-- Three small additions, all asked for by the dashboard:
--
-- 1. decisions.decision_key keeps the key the pipeline gave a decision ("d1", "d2"), so the
--    evaluation scorecard can link a ground-truth item to the decision it matched.
-- 2. pr_checks.title keeps the pull request title, so the PR checks page does not show an
--    empty title.
-- 3. The job chain needs no column: the worker puts the parent's id in the child's payload,
--    and GET /api/jobs/:id reads it from there.

ALTER TABLE decisions ADD COLUMN decision_key TEXT;
CREATE INDEX decisions_key_idx ON decisions (topic_id, decision_key);

ALTER TABLE pr_checks ADD COLUMN title TEXT;

-- Older rows have no key and no title. Fill in what we can so the pages are not blank.
UPDATE decisions
   SET decision_key = 'd' || id
 WHERE decision_key IS NULL;

UPDATE pr_checks
   SET title = ''
 WHERE title IS NULL;
