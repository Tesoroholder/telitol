import { createServerFn } from "@tanstack/react-start";
import { env } from "@/lib/env.server";

/**
 * Public, no sign-in: the support email shown on the Privacy Policy, Terms and
 * delete-account pages. Set SUPPORT_EMAIL in Vercel; null hides the line.
 */
export const getSupportEmail = createServerFn({ method: "GET" }).handler(
  async (): Promise<string | null> => {
    const email = env("SUPPORT_EMAIL")?.trim();
    return email && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)
      ? email
      : null;
  },
);
