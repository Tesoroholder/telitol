-- In-app notifications: someone answered you, accepted your answer, found it
-- helpful, or a moderator acted on your post.
create table if not exists notifications (
  id serial primary key,
  user_id text not null,
  kind text not null,
  question_id integer references questions (id) on delete cascade,
  answer_id integer references answers (id) on delete cascade,
  actor_name text not null default '',
  -- Helpful votes on one answer collapse into a single unread notification.
  count integer not null default 1,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint notifications_kind_chk check (kind in ('answer', 'best', 'helpful', 'hidden', 'suspended'))
);

create index if not exists notifications_user_idx on notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on notifications (user_id) where read_at is null;
create unique index if not exists notifications_helpful_unread_uniq
  on notifications (user_id, answer_id) where kind = 'helpful' and read_at is null;
