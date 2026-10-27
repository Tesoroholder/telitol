import { createFileRoute, redirect } from "@tanstack/react-router";

/** The companion was renamed to AI; keep old links working. */
export const Route = createFileRoute("/laya")({
  beforeLoad: () => {
    throw redirect({ to: "/ai", statusCode: 301 });
  },
});
