-- Moderation can hide a question or answer without deleting it. Hidden rows
-- drop out of feeds and counts but stay visible to their author and moderators.
alter table questions add column if not exists hidden_at timestamptz;
alter table questions add column if not exists hidden_reason text;
alter table answers add column if not exists hidden_at timestamptz;
alter table answers add column if not exists hidden_reason text;

-- Feed: newest visible questions, optionally by category.
create index if not exists questions_feed_idx
  on questions (created_at desc, id desc) where hidden_at is null;
create index if not exists questions_category_feed_idx
  on questions (category, created_at desc, id desc) where hidden_at is null;
create index if not exists questions_user_idx on questions (user_id, created_at desc);
create index if not exists answers_user_idx on answers (user_id, created_at desc);
