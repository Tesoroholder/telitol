create table if not exists profiles (
  user_id text primary key,
  display_name text not null,
  reputation integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists questions (
  id serial primary key,
  user_id text not null,
  author_name text not null,
  title text not null,
  body text not null,
  category text not null,
  kind text not null,
  created_at timestamptz not null default now(),
  constraint questions_kind_chk check (kind in ('experience', 'knowledge')),
  constraint questions_category_chk check (
    category in (
      'relationships', 'life', 'career', 'education', 'mathematics',
      'technology', 'business', 'health', 'home', 'other'
    )
  )
);

create index if not exists questions_created_idx on questions (created_at desc);

create table if not exists answers (
  id serial primary key,
  question_id integer not null references questions (id) on delete cascade,
  user_id text not null,
  author_name text not null,
  body text not null,
  helpful integer not null default 0,
  is_best boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists answers_question_idx on answers (question_id);

create table if not exists helpful_votes (
  user_id text not null,
  answer_id integer not null references answers (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, answer_id)
);

create table if not exists laya_threads (
  id serial primary key,
  user_id text not null,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists laya_threads_user_idx on laya_threads (user_id, updated_at desc);

create table if not exists laya_messages (
  id serial primary key,
  thread_id integer not null references laya_threads (id) on delete cascade,
  user_id text not null,
  role text not null,
  content text not null,
  created_at timestamptz not null default now(),
  constraint laya_messages_role_chk check (role in ('user', 'assistant'))
);

create index if not exists laya_messages_thread_idx on laya_messages (thread_id, id);

insert into questions (user_id, author_name, title, body, category, kind, created_at)
select 'seed:nila', 'Nila',
  'What did your first heartbreak actually feel like?',
  'I do not want the poster version. I want the real one. What did the first weeks feel like, and what actually helped you get through them?',
  'relationships', 'experience', now() - interval '2 hours'
where not exists (
  select 1 from questions where user_id = 'seed:nila'
);

insert into questions (user_id, author_name, title, body, category, kind, created_at)
select 'seed:arun', 'Arun',
  'How do I prepare for a job interview with almost no experience?',
  'I have one campus project and a part-time shop job. I freeze when they ask me to "walk us through your experience." What did you actually say when you had almost nothing on paper?',
  'career', 'experience', now() - interval '1 day'
where not exists (
  select 1 from questions where user_id = 'seed:arun'
);

insert into questions (user_id, author_name, title, body, category, kind, created_at)
select 'seed:divya', 'Divya',
  'What surprised you about moving to a new city alone?',
  'I am about to move with two bags and nobody waiting at the station. I want the unpretty version of the first month, not a travel list.',
  'life', 'experience', now() - interval '2 days'
where not exists (
  select 1 from questions where user_id = 'seed:divya'
);

insert into questions (user_id, author_name, title, body, category, kind, created_at)
select 'seed:sam', 'Sam',
  'How do you study when your mind keeps wandering?',
  'I sit down for three hours and remember none of it. What actually works when the task feels too big to start?',
  'education', 'knowledge', now() - interval '3 days'
where not exists (
  select 1 from questions where user_id = 'seed:sam'
);

insert into questions (user_id, author_name, title, body, category, kind, created_at)
select 'seed:leila', 'Leila',
  'What helped you sleep again after a stressful season?',
  'After exams I was exhausted and wide awake. I am not looking for a medical plan. I want what your nights were actually like, and what you changed.',
  'health', 'experience', now() - interval '4 days'
where not exists (
  select 1 from questions where user_id = 'seed:leila'
);

insert into questions (user_id, author_name, title, body, category, kind, created_at)
select 'seed:jonah', 'Jonah',
  'Why do we complete the square, in plain language?',
  'I can follow the steps and still not know why anyone would do this. Can someone explain the idea, not just the recipe?',
  'mathematics', 'knowledge', now() - interval '6 days'
where not exists (
  select 1 from questions where user_id = 'seed:jonah'
);

insert into answers (question_id, user_id, author_name, body, helpful, is_best, created_at)
select q.id, 'seed:ama', 'Ama',
  'The first week I kept checking my phone like it was a door. What helped was not a quote. I told one friend the unpretty version, and I walked at the same time every evening so the day had an edge. It did not feel better. It felt less endless.',
  24, true, now() - interval '90 minutes'
from questions q
where q.user_id = 'seed:nila'
  and not exists (select 1 from answers a where a.user_id = 'seed:ama');

insert into answers (question_id, user_id, author_name, body, helpful, is_best, created_at)
select q.id, 'seed:kofi', 'Kofi',
  'I thought I was handling it until a song started in a shared auto. I got off two stops early and just stood there. The useful part was stopping the attempt to win the story. I wrote what I wished I had said, and I did not send it. After about a month the song was just a song again. Not gone. Quieter.',
  18, false, now() - interval '70 minutes'
from questions q
where q.user_id = 'seed:nila'
  and not exists (select 1 from answers a where a.user_id = 'seed:kofi');

insert into answers (question_id, user_id, author_name, body, helpful, is_best, created_at)
select q.id, 'seed:meera', 'Meera',
  'I wrote three stories in this shape: the situation, what I did, what changed. Interviewers do not need a career. They need to see how you think when something is messy. I practiced out loud until I stopped apologizing for being new. The shop job counted. A rude customer and a calm fix is a story.',
  15, true, now() - interval '20 hours'
from questions q
where q.user_id = 'seed:arun'
  and not exists (select 1 from answers a where a.user_id = 'seed:meera');

insert into answers (question_id, user_id, author_name, body, helpful, is_best, created_at)
select q.id, 'seed:luis', 'Luis',
  'I moved with two bags and no one at the station. The surprise was how loud loneliness is at 9pm, and how much a tiny routine fixes before new friends do. A tea stall learned my order before anyone learned my name. Start there. One place you go at the same time every day.',
  11, true, now() - interval '36 hours'
from questions q
where q.user_id = 'seed:divya'
  and not exists (select 1 from answers a where a.user_id = 'seed:luis');

insert into answers (question_id, user_id, author_name, body, helpful, is_best, created_at)
select q.id, 'seed:priya', 'Priya',
  'This is only what I lived, not medical advice. I was tired and awake at the same time. What changed it was a boring wind-down I kept even when it felt pointless: phone in another room, lights low, a paper book I did not care about. It took about two weeks before my body believed the night was over.',
  9, true, now() - interval '3 days'
from questions q
where q.user_id = 'seed:leila'
  and not exists (select 1 from answers a where a.user_id = 'seed:priya');

insert into answers (question_id, user_id, author_name, body, helpful, is_best, created_at)
select q.id, 'seed:hana', 'Hana',
  'Completing the square forces a quadratic to look like (something) squared plus a leftover number, because squares are easy to undo with a square root. For x squared + 6x, ask what was doubled to make 6. That is 3. Square it to get 9. Add and subtract 9 so the value does not change. Then (x+3) squared - 9 is sitting in front of you, and you can take the root.',
  21, true, now() - interval '5 days'
from questions q
where q.user_id = 'seed:jonah'
  and not exists (select 1 from answers a where a.user_id = 'seed:hana');
