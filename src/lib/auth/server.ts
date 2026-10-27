/**
 * Better Auth for TeliTol (server-only).
 *
 * Email/password is always on. Google and X sign-in turn on when their client
 * id/secret env vars are set. Sessions live in the same Postgres as app data:
 * Neon when `DATABASE_URL` is set, otherwise the embedded PGLite used in local dev.
 *
 * NEVER import this from client code — it pulls in `pg` and the auth secret.
 * The client uses `@/lib/auth/client`; server functions get a verified user id
 * via `@/lib/auth/middleware`.
 */
import { betterAuth } from "better-auth";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { ensureDbReady, getPglite } from "../db";
import { env } from "../env.server";
import { pgliteDialect } from "./pglite-dialect";

void ensureDbReady();

const isProduction =
  Boolean(env("VERCEL")) || process.env.NODE_ENV === "production";

/**
 * Production must have a fixed secret: serverless instances each minting their
 * own would invalidate every session on cold start. Local dev keeps one secret
 * per process on globalThis so HMR doesn't sign everyone out.
 */
function authSecret(): string {
  const configured = env("BETTER_AUTH_SECRET");
  if (configured) return configured;
  if (isProduction) {
    throw new Error(
      "BETTER_AUTH_SECRET is not set. Add a random 32+ character value in Vercel.",
    );
  }
  const ref = globalThis as typeof globalThis & {
    __telitolDevAuthSecret__?: string;
  };
  ref.__telitolDevAuthSecret__ ??= randomBytes(32).toString("hex");
  return ref.__telitolDevAuthSecret__;
}

function withScheme(host: string | undefined): string | undefined {
  if (!host) return undefined;
  return host.startsWith("http") ? host : `https://${host}`;
}

// Canonical public URL: explicit override, then Vercel's production domain, then
// this deployment's own URL (preview deploys), then local dev.
const baseURL =
  env("BETTER_AUTH_URL") ??
  withScheme(env("VERCEL_PROJECT_PRODUCTION_URL")) ??
  withScheme(env("VERCEL_URL")) ??
  "http://localhost:8080";

// Origins allowed to make credentialed auth POSTs. Exact hosts only — never a
// `*.vercel.app` wildcard, which would trust every other Vercel app.
const trustedOrigins = [
  baseURL,
  withScheme(env("VERCEL_URL")),
  withScheme(env("VERCEL_BRANCH_URL")),
  ...(env("TRUSTED_ORIGINS") ?? "").split(",").map((o) => o.trim()),
  ...(isProduction ? [] : ["http://localhost:8080", "http://127.0.0.1:8080"]),
].filter((origin): origin is string => Boolean(origin));

const databaseUrl = env("DATABASE_URL");
const database = databaseUrl
  ? new Pool({ connectionString: databaseUrl })
  : { dialect: pgliteDialect(() => getPglite()), type: "postgres" as const };

const socialProviders: Record<
  string,
  { clientId: string; clientSecret: string }
> = {};
const googleId = env("GOOGLE_CLIENT_ID");
const googleSecret = env("GOOGLE_CLIENT_SECRET");
if (googleId && googleSecret)
  socialProviders.google = { clientId: googleId, clientSecret: googleSecret };
const xId = env("TWITTER_CLIENT_ID") ?? env("X_CLIENT_ID");
const xSecret = env("TWITTER_CLIENT_SECRET") ?? env("X_CLIENT_SECRET");
if (xId && xSecret)
  socialProviders.twitter = { clientId: xId, clientSecret: xSecret };

/** Social providers with credentials configured, for the sign-in buttons. */
export const enabledSocialProviders = Object.keys(socialProviders) as (
  "google" | "twitter"
)[];

export const auth = betterAuth({
  baseURL,
  secret: authSecret(),
  database,
  trustedOrigins,
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },
  ...(enabledSocialProviders.length > 0 ? { socialProviders } : {}),
  account: {
    encryptOAuthTokens: true,
    accountLinking: { enabled: true, trustedProviders: ["google"] },
  },
  session: { cookieCache: { enabled: true, maxAge: 300 } },
  // Shared across serverless instances via the "rateLimit" table (0003).
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 3600, max: 5 },
    },
  },
  plugins: [tanstackStartCookies()],
});
