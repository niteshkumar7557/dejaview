-- 001_init.sql — the whole schema, taken from design.md §7.
--
-- The CHECK constraints use exactly the values the shared contract allows
-- (DECISION_STATUSES, TRIAGE_LABELS and friends), so a bad value cannot reach the database.

CREATE TABLE topics (
  id            SERIAL PRIMARY KEY,
  slug          TEXT UNIQUE NOT NULL,            -- 'pep-701'
  title         TEXT NOT NULL,
  pep_number    INT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE sources (
  id            SERIAL PRIMARY KEY,
  topic_id      INT REFERENCES topics(id),
  kind          TEXT NOT NULL CHECK (kind IN ('discourse','github_issue','github_pr','upload')),
  url           TEXT,
  external_id   TEXT,
  title         TEXT,
  raw           JSONB,
  fetched_at    TIMESTAMPTZ DEFAULT now(),
  -- One topic cannot hold the same thread twice: re-ingesting updates the row instead of
  -- piling up copies.
  UNIQUE (topic_id, kind, external_id)
);

CREATE TABLE people (
  id            SERIAL PRIMARY KEY,
  display_name  TEXT NOT NULL
);

CREATE TABLE identities (
  id            SERIAL PRIMARY KEY,
  person_id     INT REFERENCES people(id),
  platform      TEXT NOT NULL,                   -- 'discourse','github','git'
  handle        TEXT NOT NULL,
  email         TEXT,
  confidence    REAL NOT NULL,
  evidence      TEXT,
  UNIQUE (platform, handle)
);

CREATE TABLE posts (
  id            SERIAL PRIMARY KEY,
  source_id     INT REFERENCES sources(id) ON DELETE CASCADE,
  external_id   TEXT NOT NULL,                   -- Discourse post number / GitHub comment id
  thread_post_id INT,                           -- the id the post has inside the thread
  identity_id   INT REFERENCES identities(id),
  author_handle TEXT NOT NULL,
  created_at    TIMESTAMPTZ,
  url           TEXT,
  body_raw      TEXT NOT NULL,
  body_clean    TEXT NOT NULL,                   -- quotes stripped
  signal_score  REAL,
  triage_label  TEXT CHECK (triage_label IS NULL OR triage_label IN
                   ('proposal','alternative','objection','support','decision','question','noise')),
  skipped       BOOLEAN DEFAULT false,
  UNIQUE (source_id, external_id)
);

CREATE TABLE decisions (
  id            SERIAL PRIMARY KEY,
  topic_id      INT REFERENCES topics(id),
  title         TEXT NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('proposal','alternative')),
  status        TEXT NOT NULL CHECK (status IN ('accepted','rejected','withdrawn','open')),
  summary       TEXT,
  confidence    TEXT NOT NULL CHECK (confidence IN ('high','medium','low')),
  decided_at    TIMESTAMPTZ,
  model         TEXT NOT NULL,                   -- which model produced it
  search        TSVECTOR,                        -- title + summary + reasons
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX decisions_search_idx ON decisions USING GIN (search);

CREATE TABLE reasons (
  id            SERIAL PRIMARY KEY,
  decision_id   INT REFERENCES decisions(id) ON DELETE CASCADE,
  text          TEXT NOT NULL
);

CREATE TABLE evidence (
  id            SERIAL PRIMARY KEY,
  decision_id   INT REFERENCES decisions(id) ON DELETE CASCADE,
  reason_id     INT REFERENCES reasons(id) ON DELETE CASCADE,
  post_id       INT REFERENCES posts(id),
  thread_post_id INT,                           -- the post id inside the thread, as the model cited it
  quote         TEXT NOT NULL,
  verified      BOOLEAN NOT NULL,
  match_score   REAL NOT NULL
);

CREATE TABLE code_anchors (
  id              SERIAL PRIMARY KEY,
  decision_id     INT REFERENCES decisions(id) ON DELETE CASCADE,
  repo            TEXT NOT NULL,                 -- 'python/cpython'
  symbol          TEXT,
  original_path   TEXT NOT NULL,
  original_commit TEXT,
  current_path    TEXT,
  relocated_by    TEXT CHECK (relocated_by IS NULL OR relocated_by IN ('git-follow','symbol-search')),
  link_method     TEXT NOT NULL CHECK (link_method IN ('pr_ref','path_mention','symbol_mention')),
  evidence_post_id INT REFERENCES posts(id),
  last_checked_at TIMESTAMPTZ
);

CREATE TABLE jobs (
  id            SERIAL PRIMARY KEY,
  type          TEXT NOT NULL CHECK (type IN ('ingest','extract','link','eval')),
  payload       JSONB NOT NULL,
  status        TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed')),
  stage         TEXT,
  progress      REAL DEFAULT 0,
  error         TEXT,
  attempt       INT NOT NULL DEFAULT 0,         -- fencing token: only the newest attempt may finish
  started_at    TIMESTAMPTZ,
  locked_until  TIMESTAMPTZ,                     -- lease: a crashed worker cannot strand a job
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
-- The worker only ever looks for queued jobs, and always in id order.
CREATE INDEX jobs_queued_idx ON jobs (id) WHERE status = 'queued';

CREATE TABLE llm_calls (
  id            SERIAL PRIMARY KEY,
  job_id        INT REFERENCES jobs(id),
  prompt_hash   TEXT UNIQUE NOT NULL,
  model         TEXT NOT NULL,
  stage         TEXT NOT NULL,
  prompt        TEXT NOT NULL,
  response      JSONB NOT NULL,
  duration_ms   INT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Which model calls led to which decision. One call can belong to several decisions (a chunk of
-- the thread can produce several ideas) and one decision can come from several calls.
CREATE TABLE decision_llm_calls (
  decision_id   INT REFERENCES decisions(id) ON DELETE CASCADE,
  llm_call_id   INT REFERENCES llm_calls(id) ON DELETE CASCADE,
  PRIMARY KEY (decision_id, llm_call_id)
);

CREATE TABLE eval_runs (
  id            SERIAL PRIMARY KEY,
  topic_id      INT REFERENCES topics(id),
  pep_number    INT NOT NULL,
  ground_truth  JSONB NOT NULL,                  -- parsed Rejected Ideas items
  matches       JSONB NOT NULL,                  -- per item: matched decision id, judge verdict
  recall        REAL NOT NULL,
  reason_agreement REAL NOT NULL,
  extra_ideas   INT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE pr_checks (
  id            SERIAL PRIMARY KEY,
  repo          TEXT NOT NULL,
  pr_number     INT NOT NULL,
  matched_decision_ids INT[] NOT NULL,
  similar_rejected_ids INT[] NOT NULL,
  comment_body  TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);
