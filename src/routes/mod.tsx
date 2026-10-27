import { useCallback, useEffect, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ErrorNote, SecondaryButton } from "@/components/fields";
import { listReports, resolveReport } from "@/lib/telitol/moderation-server";
import type { ReportGroup } from "@/lib/telitol/moderation";
import { formatWhen } from "@/lib/telitol/shared";

export const Route = createFileRoute("/mod")({ component: ModerationPage });

const TARGET_LABEL = {
  question: "Question",
  answer: "Answer",
  connect_room: "Connect chat",
} as const;

function ModerationPage() {
  const [reports, setReports] = useState<ReportGroup[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await listReports();
      if (!result.ok) {
        setError(result.error);
        setReports([]);
      } else {
        setReports(result.reports);
      }
    } catch {
      setError("Couldn't load reports.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(
    group: ReportGroup,
    action: "hide" | "restore" | "dismiss",
    suspendDays = 0,
  ) {
    const key = `${group.targetType}:${group.targetId}`;
    setBusy(key);
    setError("");
    try {
      const result = await resolveReport({
        data: {
          targetType: group.targetType,
          targetId: group.targetId,
          action,
          suspendDays,
          note: "",
        },
      });
      if (!result.ok) setError(result.error);
      else
        setReports((current) =>
          (current ?? []).filter(
            (g) => `${g.targetType}:${g.targetId}` !== key,
          ),
        );
    } catch {
      setError("That action didn't go through.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Moderation</h1>
        <p className="mt-2 text-sm text-muted">
          Open reports, most reported first. Posts with 3 or more reports are
          already hidden until you decide.
        </p>
      </div>
      <ErrorNote message={error} />
      {reports === null ? (
        <div
          className="h-28 animate-pulse rounded-3xl bg-mint"
          aria-hidden="true"
        />
      ) : null}
      {reports && reports.length === 0 && !error ? (
        <p className="text-sm text-muted">Nothing to review.</p>
      ) : null}
      <ul className="space-y-3">
        {(reports ?? []).map((group) => {
          const key = `${group.targetType}:${group.targetId}`;
          return (
            <li
              key={key}
              className="space-y-3 rounded-3xl border border-line bg-card p-4"
            >
              <p className="text-sm text-muted">
                <span className="font-semibold text-ink">
                  {TARGET_LABEL[group.targetType]}
                </span>{" "}
                by{" "}
                <span className="font-medium text-ink">{group.authorName}</span>{" "}
                · {group.reportCount}{" "}
                {group.reportCount === 1 ? "report" : "reports"} ·{" "}
                {formatWhen(group.latestAt)}
                {group.hidden ? " · hidden" : ""}
                {group.priorActioned > 0
                  ? ` · ${group.priorActioned} earlier upheld`
                  : ""}
              </p>
              <p className="text-sm">
                <span className="font-medium">Reasons:</span>{" "}
                {group.reasons.join(", ")}
              </p>
              {group.details.length > 0 ? (
                <ul className="list-disc pl-5 text-sm text-muted">
                  {group.details.map((detail, i) => (
                    <li key={i}>{detail}</li>
                  ))}
                </ul>
              ) : null}
              <p className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-2xl bg-paper p-3 text-sm">
                {group.preview}
              </p>
              {group.questionId ? (
                <Link
                  to="/q/$id"
                  params={{ id: String(group.questionId) }}
                  className="text-sm font-medium text-green hover:underline"
                >
                  Open in context
                </Link>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <SecondaryButton
                  disabled={busy === key}
                  onClick={() => void act(group, "hide")}
                >
                  {group.targetType === "connect_room" ? "Uphold" : "Hide"}
                </SecondaryButton>
                <SecondaryButton
                  disabled={busy === key}
                  onClick={() => void act(group, "hide", 7)}
                >
                  Uphold + suspend 7 days
                </SecondaryButton>
                {group.hidden ? (
                  <SecondaryButton
                    disabled={busy === key}
                    onClick={() => void act(group, "restore")}
                  >
                    Restore
                  </SecondaryButton>
                ) : null}
                <SecondaryButton
                  disabled={busy === key}
                  onClick={() => void act(group, "dismiss")}
                >
                  Dismiss
                </SecondaryButton>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
