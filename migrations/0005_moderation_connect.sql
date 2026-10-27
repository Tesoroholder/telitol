-- Moderation: roles, suspensions, reports and an audit log.
alter table profiles add column if not exists role text not null default 'member';
alter table profiles add column if not exists suspended_until timestamptz;
alter table profiles drop constraint if exists profiles_role_chk;
alter table profiles add constraint profiles_role_chk check (role in ('member', 'moderator', 'admin'));

create table if not exists reports (
  id serial primary key,
  reporter_id text not null,
  target_type text not null,
  target_id text not null,
  -- Who wrote the reported content, so repeat offenders are easy to spot.
  target_user_id text not null,
  reason text not null,
  details text not null default '',
  status text not null default 'open',
  created_at timestamptz not null default now(),
  resolved_by text,
  resolved_at timestamptz,
  constraint reports_target_chk check (target_type in ('question', 'answer', 'connect_room')),
  constraint reports_reason_chk check (
    reason in ('spam', 'harassment', 'hate', 'sexual', 'self_harm', 'misinformation', 'other')
  ),
  constraint reports_status_chk check (status in ('open', 'actioned', 'dismissed')),
  constraint reports_once unique (reporter_id, target_type, target_id)
);

create index if not exists reports_open_idx on reports (status, created_at desc);
create index if not exists reports_target_idx on reports (target_type, target_id);
create index if not exists reports_target_user_idx on reports (target_user_id, created_at desc);

create table if not exists moderation_actions (
  id serial primary key,
  moderator_id text not null,
  action text not null,
  target_type text not null,
  target_id text not null,
  note text not null default '',
  created_at timestamptz not null default now()
);

-- Anonymous Connect: two strangers matched into a short, timed chat room.
create table if not exists connect_queue (
  user_id text primary key,
  topic text,
  joined_at timestamptz not null default now()
);

create index if not exists connect_queue_joined_idx on connect_queue (joined_at);

create table if not exists connect_rooms (
  id text primary key,
  user_a text not null,
  user_b text not null,
  alias_a text not null,
  alias_b text not null,
  topic text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  ended_by text
);

create index if not exists connect_rooms_user_a_idx on connect_rooms (user_a, created_at desc);
create index if not exists connect_rooms_user_b_idx on connect_rooms (user_b, created_at desc);

create table if not exists connect_messages (
  id serial primary key,
  room_id text not null references connect_rooms (id) on delete cascade,
  sender_id text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists connect_messages_room_idx on connect_messages (room_id, id);

-- A person can block a stranger so they are never matched again.
create table if not exists connect_blocks (
  user_id text not null,
  blocked_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, blocked_id)
);
