-- Better Auth rate limiting (storage: "database"), shared across serverless
-- instances. Column names are camelCase and quoted because Better Auth queries
-- them that way.
create table if not exists "rateLimit" (
  "id" text not null primary key,
  "key" text not null unique,
  "count" integer not null,
  "lastRequest" bigint not null
);

-- App-level rate limits for server functions (questions, answers, AI, reports,
-- Connect). One row per (action, user) bucket; see src/lib/telitol/rate-limit.ts.
create table if not exists app_rate_limits (
  key text primary key,
  count integer not null,
  window_start timestamptz not null default now()
);
