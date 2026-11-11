-- Askers can edit their questions at any time; readers see "Edited".
alter table questions add column if not exists edited_at timestamptz;

-- "Your questions" on the You page lists one member's questions, newest first.
create index if not exists questions_user_created_idx on questions (user_id, created_at desc);
