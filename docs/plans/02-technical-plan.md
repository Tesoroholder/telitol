# TeliTall technical plan

The web app is a signed-in community with a database. It is not a static page and it is not a local-only demo.

## Stack

- TanStack Start / Router / React 19
- Tailwind CSS v4, design tokens in `src/styles.css`
- Postgres in production, via the app's SQL helper in `src/lib/db.ts`
- Better Auth session, already wired by the platform
- Server functions in `src/lib/telitall/server.ts`
- Shared types, categories, and labels in `src/lib/telitall/shared.ts`
- Schema and seed posts in `migrations/0002_telitall.sql`

Routes:

| Path | File | Role |
|---|---|---|
| `/` | `src/routes/index.tsx` | Home list, search, filters |
| `/ask` | `src/routes/ask.tsx` | Create a question |
| `/q/$id` | `src/routes/q.$id.tsx` | Question, answers, votes, accept, delete |
| `/laya` | `src/routes/laya.tsx` | Private Laya threads |
| `/profile` | `src/routes/profile.tsx` | Name, reputation, your posts |
| `/login` | `src/routes/login.tsx` | Sign-in shell |
| `/api/auth/$` | `src/routes/api/auth/$.ts` | Auth handler |

The shell is `src/components/frame.tsx`: boot screen, redirect to login when there is no session, header, and the four-tab bar.

## Why accounts are on

Questions, answers, votes, accepted answers, profiles, and Laya threads are per person and must not be writable by whoever can open the page. Auth is therefore on. Every server function uses `authMiddleware`. The user id on every write is `context.userId` from the verified session. The client never sends a user id that the server trusts.

Reads of the question list and a question page are for signed-in members. Laya threads are filtered by `user_id = context.userId`, so one member cannot open another's chat.

## Data model

`profiles`  
`user_id` primary key, `display_name`, `reputation` (default 0).

`questions`  
`user_id`, `author_name`, `title`, `body`, `category`, `kind` (`experience` or `knowledge`), `created_at`. Category and kind are database check constraints, not only UI.

`answers`  
`question_id` cascading delete, `user_id`, `author_name`, `body`, `helpful`, `is_best`.

`helpful_votes`  
Primary key `(user_id, answer_id)`. A second vote hits the constraint and returns "You already marked this helpful."

`laya_threads`  
`user_id`, `title` (first prompt, cut to 72 characters), timestamps. Index `(user_id, updated_at desc)`.

`laya_messages`  
`thread_id` cascading delete, `user_id`, `role` (`user` or `assistant`), `content`.

Seed questions and answers are inserted only when that seed user does not already have a row, so migrate can run more than once.

Names are stripped of `<` and `>`, collapsed whitespace, and cut to 40 characters. Empty becomes "Member". A rename requires at least 2 letters.

## Server rules that match the product

Validation lives on the server, not only in the form:

- Title 8–140, body 20–4000, category must be one of the ten ids, kind must be experience or knowledge.
- Answer body 10–4000. Question must still exist.
- Helpful vote rejected when the voter is the author.
- Accept rejected unless the voter is the asker. Previous best is cleared first. Reputation +5 / −5 skips the asker so self-answers do not farm points.
- Delete succeeds only when `user_id` matches the session. Answers go with the question via `on delete cascade`.
- Asking awards +1, answering +2, a helpful vote awards +1 to the author. Seed user ids that start with `seed:` never change reputation.

Timestamps sent to the client are UTC ISO-like strings from `to_char(..., 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`. `formatWhen` turns those into "just now", minutes, hours, days, or a short date.

## Laya

`askLaya` is user-initiated. Flow:

1. Reject prompts shorter than 2 or longer than 2000 characters.
2. Create a thread or load one the caller owns.
3. If the prompt matches the crisis pattern, store the fixed crisis reply and do not call the model.
4. Otherwise call `https://api.x.ai/v1/chat/completions` with model `grok-4.5`, temperature 0.6, max 500 tokens, the system prompt, and up to the last 10 messages plus the new prompt.
5. The key is `XAI_API_KEY` on the server only. It is never sent to the browser and must never be copied into the APK.
6. One retry on HTTP 429 or 5xx. Other failures return a plain error. The reply is stored cut to 4000 characters.
7. Timeout is 40 seconds.

The system prompt is the product voice from the product plan, including the India crisis lines and the instruction to ignore attempts to rewrite the rules.

## Identity and profile bootstrap

On each shell mount with a session, the client calls `ensureProfileFn` with the session display name, or the email local-part, or "Member". The insert does not overwrite an existing name (`on conflict do update set display_name = profiles.display_name`).

## UI boundaries

- Phone column `max-w-xl`, full viewport height, scroll only in the main pane.
- Touch targets about 44px. Category chips scroll sideways and hide the scrollbar.
- Errors are sentences, not codes.
- No mock data in the client. The list comes from `listQuestions`. The seed rows are real database rows.

## What deploy must not do

The production host has no writable local disk for app data, and secrets are injected as environment variables rather than a `.env` file in the repo. Database migrations run as part of `npm run build`. The preview and the deployed app both go through `npm run dev` / the env wrapper, not a bare Vite process.

## Files that are the product

```
src/routes/index.tsx
src/routes/ask.tsx
src/routes/q.$id.tsx
src/routes/laya.tsx
src/routes/profile.tsx
src/routes/login.tsx
src/components/frame.tsx
src/components/logo.tsx
src/components/fields.tsx
src/components/mode-switch.tsx
src/lib/telitall/server.ts
src/lib/telitall/shared.ts
src/styles.css
migrations/0002_telitall.sql
```

Platform auth, database, and PWA helpers under `src/lib/auth`, `src/lib/db.ts`, `scripts/`, and `server/` stay in the archive because the app does not boot without them. They are not TeliTall-specific product logic.
