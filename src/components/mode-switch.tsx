import { Link } from "@tanstack/react-router";

export function ModeSwitch({ mode }: { mode: "human" | "ai" }) {
  const item = (active: boolean) =>
    `flex h-11 items-center justify-center rounded-full px-3 text-sm font-semibold ${
      active ? "bg-card text-ink shadow-card" : "text-muted"
    }`;
  return (
    <div className="grid grid-cols-2 gap-1 rounded-full bg-mint p-1">
      <Link to="/ask" className={item(mode === "human")}>
        Ask a person
      </Link>
      <Link to="/ai" className={item(mode === "ai")}>
        Ask AI
      </Link>
    </div>
  );
}
