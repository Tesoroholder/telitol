import { useState } from "react";

const REASONS = [
  { id: "spam", label: "Spam or ads" },
  { id: "harassment", label: "Harassment or bullying" },
  { id: "hate", label: "Hate speech" },
  { id: "sexual", label: "Sexual content" },
  { id: "self_harm", label: "Someone may be at risk" },
  { id: "misinformation", label: "Harmful misinformation" },
  { id: "other", label: "Something else" },
] as const;

type Result = { ok: true; hidden: boolean } | { ok: false; error: string };

/** "Report" link that opens a reason picker; `onReport` files it on the server. */
export function ReportButton({
  label = "Report",
  onReport,
}: {
  label?: string;
  onReport: (reason: string, details: string) => Promise<Result>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("spam");
  const [details, setDetails] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  if (message) return <p className="text-sm text-muted">{message}</p>;

  if (!open) {
    return (
      <button
        type="button"
        className="text-sm font-medium text-muted hover:underline"
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
    );
  }

  async function submit() {
    setPending(true);
    try {
      const result = await onReport(reason, details.trim());
      setMessage(
        result.ok ? "Thanks. A moderator will take a look." : result.error,
      );
    } catch {
      setMessage("Couldn't send that report. Try again later.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="w-full space-y-2 rounded-2xl border border-line bg-card p-3">
      <label className="block text-sm font-semibold" htmlFor="report-reason">
        What's wrong?
      </label>
      <select
        id="report-reason"
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        className="h-10 w-full rounded-lg border border-line bg-card px-2 text-sm"
      >
        {REASONS.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
      <textarea
        value={details}
        maxLength={1000}
        rows={2}
        onChange={(event) => setDetails(event.target.value)}
        placeholder="Anything a moderator should know (optional)"
        className="w-full rounded-lg border border-line bg-card px-2 py-2 text-sm"
      />
      {reason === "self_harm" ? (
        <p className="text-xs text-muted">
          If someone is in danger now, contact local emergency services. In
          India: iCall 9152987821, AASRA 9820466726.
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => void submit()}
          className="h-9 rounded-full bg-ink px-4 text-sm font-semibold text-on-ink disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send report"}
        </button>
        <button
          type="button"
          className="h-9 px-3 text-sm text-muted"
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
