import { useEffect, useState } from "react";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ContactLine, PublicPage } from "@/components/public-page";
import { DELETED_ITEMS } from "@/components/delete-account";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

/**
 * Public page Google Play links to as the "delete account URL". Works signed
 * out; signed-in visitors go straight to the form on the You page.
 */
export const Route = createFileRoute("/delete-account")({
  component: DeleteAccountPage,
});

function DeleteAccountPage() {
  const { user, isPending } = useCurrentUserState();
  const [done, setDone] = useState(false);

  useEffect(() => {
    setDone(new URLSearchParams(window.location.search).get("done") === "1");
  }, []);

  if (done) {
    return (
      <PublicPage title="Your account is deleted">
        <p>
          Your TeliTol account and everything listed below have been deleted.
          Thank you for being part of TeliTol.
        </p>
        <Link to="/login" className="font-semibold text-green underline">
          Back to sign in
        </Link>
      </PublicPage>
    );
  }

  return (
    <PublicPage title="Delete your TeliTol account">
      <p>
        You can delete your TeliTol account at any time, from the app or from
        this page. Deletion is immediate and can't be undone.
      </p>

      <h2>How to delete it</h2>
      <ul>
        <li>
          In the app: open <strong>You</strong>, scroll to{" "}
          <strong>Delete account</strong>, and follow the steps.
        </li>
        <li>
          On the web: sign in below, and you'll go straight to the same form.
        </li>
      </ul>
      {!isPending ? (
        user ? (
          <a
            href="/profile#delete-account"
            className="inline-flex h-12 items-center rounded-full bg-ink px-5 font-semibold text-on-ink"
          >
            Go to Delete account
          </a>
        ) : (
          <Link
            to="/login"
            className="inline-flex h-12 items-center rounded-full bg-ink px-5 font-semibold text-on-ink"
          >
            Sign in to delete your account
          </Link>
        )
      ) : null}

      <h2>What we delete</h2>
      <ul>
        {DELETED_ITEMS.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <h2>What we keep</h2>
      <ul>
        <li>
          A record of moderation decisions made by moderators (which post was
          hidden and when), without your posts or profile, so we can show how
          reports were handled.
        </li>
        <li>
          Copies in our database provider's short-term backups, which are
          removed automatically when those backups expire.
        </li>
      </ul>

      <ContactLine prefix="If you can't sign in to your account any more, email us from the address you signed up with at" />
    </PublicPage>
  );
}
