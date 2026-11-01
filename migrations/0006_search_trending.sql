-- Full-text search: titles weigh most, then question bodies, then answers.
alter table questions add column if not exists search tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(body, '')), 'B')
  ) stored;
create index if not exists questions_search_idx on questions using gin (search);

alter table answers add column if not exists search tsvector
  generated always as (to_tsvector('english', coalesce(body, ''))) stored;
create index if not exists answers_search_idx on answers using gin (search);

-- Trending looks at the last week of answers and helpful votes.
create index if not exists answers_recent_idx on answers (created_at desc, question_id);
create index if not exists helpful_votes_recent_idx on helpful_votes (created_at desc, answer_id);
