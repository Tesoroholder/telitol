import { env } from "@/lib/env.server";

/**
 * Transactional email via Resend's HTTP API (free tier: 100 emails/day).
 * Server-only. Without RESEND_API_KEY nothing is sent: in local dev the
 * message is printed to the console instead, so flows can still be tested.
 *
 * EMAIL_FROM must be an address on a domain verified in Resend. Until one is,
 * Resend's shared `onboarding@resend.dev` sender only delivers to the email
 * address that owns the Resend account.
 */

export type Email = { to: string; subject: string; text: string; html: string };

export function emailEnabled(): boolean {
  return Boolean(env("RESEND_API_KEY"));
}

export async function sendEmail(message: Email): Promise<boolean> {
  const key = env("RESEND_API_KEY");
  if (!key) {
    if (process.env.NODE_ENV !== "production") {
      console.info(
        `[email] (not sent, no RESEND_API_KEY) to ${message.to}: ${message.subject}\n${message.text}`,
      );
    } else {
      console.error(
        "[email] RESEND_API_KEY is not set; email not sent:",
        message.subject,
      );
    }
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        from: env("EMAIL_FROM") ?? "TeliTol <onboarding@resend.dev>",
        to: [message.to],
        subject: message.subject,
        text: message.text,
        html: message.html,
      }),
    });
    if (!res.ok) {
      console.error(
        `[email] Resend returned ${res.status}:`,
        (await res.text().catch(() => "")).slice(0, 300),
      );
      return false;
    }
    return true;
  } catch (error) {
    console.error(
      "[email] send failed:",
      error instanceof Error ? error.message : "unknown",
    );
    return false;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function passwordResetEmail(
  to: string,
  name: string,
  url: string,
): Email {
  const greeting = name ? `Hi ${name},` : "Hi,";
  return {
    to,
    subject: "Reset your TeliTol password",
    text: `${greeting}\n\nSomeone asked to reset the password for your TeliTol account. If it was you, open this link within an hour:\n\n${url}\n\nIf it wasn't you, ignore this email and your password stays the same.\n\nTeliTol`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;line-height:1.5;color:#0b2340">
  <p>${escapeHtml(greeting)}</p>
  <p>Someone asked to reset the password for your TeliTol account. If it was you, use this button within an hour:</p>
  <p><a href="${escapeHtml(url)}" style="display:inline-block;background:#0e9f6e;color:#fff;padding:12px 20px;border-radius:999px;text-decoration:none;font-weight:600">Reset password</a></p>
  <p style="font-size:13px;color:#5b6b7f">If it wasn't you, ignore this email and your password stays the same.</p>
  <p style="font-size:13px;color:#5b6b7f">TeliTol · Ask · Learn · Share · Grow</p>
</div>`,
  };
}
