-- People can report an AI reply (Google Play's AI-generated content policy).
-- target_id is the laya_messages id; target_user_id is the fixed author 'ai'.
alter table reports drop constraint if exists reports_target_chk;
alter table reports add constraint reports_target_chk
  check (target_type in ('question', 'answer', 'connect_room', 'ai_message'));
