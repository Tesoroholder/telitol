import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { ModeSwitch } from "@/components/mode-switch";
import { QuestionForm } from "@/components/question-form";
import { createQuestion } from "@/lib/telitol/server";

export const Route = createFileRoute("/ask")({ component: AskPage });

function AskPage() {
  const navigate = useNavigate();
  const user = useCurrentUser();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ask a person</h1>
        <p className="mt-2 text-sm text-muted">
          Experience questions want a story. Knowledge questions want a clear
          explanation.
        </p>
      </div>
      <ModeSwitch mode="human" />
      <QuestionForm
        initial={{ title: "", body: "", category: "", kind: "experience" }}
        submitLabel="Post question"
        pendingLabel="Posting…"
        onSubmit={async (draft) => {
          const result = await createQuestion({
            data: { ...draft, displayName: user?.displayName ?? "" },
          });
          if (!result.ok) return result;
          // "#posted" shows a confirmation on the question page.
          await navigate({
            to: "/q/$id",
            params: { id: String(result.id) },
            hash: "posted",
          });
          return { ok: true };
        }}
      />
    </div>
  );
}
