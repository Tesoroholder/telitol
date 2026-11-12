-- Photos on questions, answers, profiles and Connect chats. The files live in
-- Vercel Blob; these rows record who uploaded them and where they are used.
create table if not exists images (
  id serial primary key,
  user_id text not null,
  url text not null,
  pathname text not null,
  width integer not null,
  height integer not null,
  bytes integer not null,
  purpose text not null,
  created_at timestamptz not null default now(),
  constraint images_purpose_chk check (purpose in ('question', 'answer', 'avatar', 'connect'))
);
create index if not exists images_user_idx on images (user_id);
create index if not exists images_created_idx on images (created_at);

create table if not exists question_images (
  question_id integer not null references questions (id) on delete cascade,
  image_id integer not null references images (id) on delete cascade,
  position integer not null,
  primary key (question_id, image_id)
);
create unique index if not exists question_images_image_idx on question_images (image_id);

create table if not exists answer_images (
  answer_id integer not null references answers (id) on delete cascade,
  image_id integer not null references images (id) on delete cascade,
  position integer not null,
  primary key (answer_id, image_id)
);
create unique index if not exists answer_images_image_idx on answer_images (image_id);

alter table profiles add column if not exists avatar_image_id integer references images (id) on delete set null;

alter table connect_messages add column if not exists image_id integer references images (id) on delete set null;
