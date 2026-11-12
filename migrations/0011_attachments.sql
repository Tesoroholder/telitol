-- File attachments (documents, audio, video) on questions and answers, and
-- documents for TeliTol AI to read. Files live in Vercel Blob.
create table if not exists attachments (
  id serial primary key,
  user_id text not null,
  url text not null,
  pathname text not null,
  name text not null,
  content_type text not null,
  kind text not null,
  bytes integer not null,
  purpose text not null,
  -- Text read out of a document, for the AI (null for audio, video and posts).
  extracted_text text,
  created_at timestamptz not null default now(),
  constraint attachments_kind_chk check (kind in ('document', 'audio', 'video')),
  constraint attachments_purpose_chk check (purpose in ('question', 'answer', 'ai'))
);
-- One record per stored file, so a link can't be claimed twice.
create unique index if not exists attachments_url_idx on attachments (url);
create index if not exists attachments_user_idx on attachments (user_id);
create index if not exists attachments_created_idx on attachments (created_at);

create table if not exists question_attachments (
  question_id integer not null references questions (id) on delete cascade,
  attachment_id integer not null references attachments (id) on delete cascade,
  position integer not null,
  primary key (question_id, attachment_id)
);
create unique index if not exists question_attachments_file_idx on question_attachments (attachment_id);

create table if not exists answer_attachments (
  answer_id integer not null references answers (id) on delete cascade,
  attachment_id integer not null references attachments (id) on delete cascade,
  position integer not null,
  primary key (answer_id, attachment_id)
);
create unique index if not exists answer_attachments_file_idx on answer_attachments (attachment_id);

alter table laya_messages add column if not exists attachment_id integer references attachments (id) on delete set null;
