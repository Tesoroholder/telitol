import { Link, createFileRoute } from "@tanstack/react-router";
import { ContactLine, PublicPage } from "@/components/public-page";
import { LEGAL_UPDATED, MIN_AGE } from "@/lib/telitol/legal";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy Policy · TeliTol" }] }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <PublicPage title="Privacy Policy" updated={LEGAL_UPDATED}>
      <p>
        TeliTol is a community where people ask questions, share what they have
        lived, chat with an AI assistant, and talk anonymously with another
        member in Connect. This policy explains what we collect, why, who we
        share it with, and how you can delete it. It applies to the TeliTol
        website and the TeliTol Android app.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account details.</strong> Your name and email address, and
          your password stored only as a secure hash. If you sign in with
          Google or X, we receive your name, email address and profile picture
          from them.
        </li>
        <li>
          <strong>Profile.</strong> The name shown on your posts, your
          reputation points, and whether you are a moderator or suspended.
        </li>
        <li>
          <strong>What you post.</strong> Questions, answers and helpful votes.
          Questions and answers are visible to every signed-in member, with
          your display name.
        </li>
        <li>
          <strong>Photos.</strong> Photos you add to questions, answers, your
          profile or Connect chats. The app shrinks each photo and removes its
          hidden details, including location, before it is uploaded. Photos are
          stored at a long, random web address that isn't listed anywhere, and
          they are shown to the people who can see the post or chat they belong
          to.
        </li>
        <li>
          <strong>Files.</strong> Documents (such as PDF, Word, Excel,
          PowerPoint and text files), audio and video you attach to questions
          or answers, and documents you attach in AI chats. We check each file
          by its contents, keep its name, type and size, and store it at a
          long, random web address that isn't listed anywhere. Files on posts
          are shown to the people who can see the post. Files are not changed,
          so remove anything private from a document before attaching it.
        </li>
        <li>
          <strong>AI chats.</strong> The questions you ask TeliTol AI and its
          replies, and the text read from any document you attach. Only you can
          see them, unless you report a reply, in which
          case moderators see that reply and any note you add.
        </li>
        <li>
          <strong>Connect chats.</strong> Messages you send in anonymous
          Connect chats, the random nickname you were given, and people you
          block. Your partner never sees your name or email.
        </li>
        <li>
          <strong>Reports and moderation.</strong> Reports you file, reports
          about your content, and moderators' decisions.
        </li>
        <li>
          <strong>Notifications</strong> about activity on your posts.
        </li>
        <li>
          <strong>Technical data.</strong> Your IP address and browser or
          device type, saved with your sign-in session, and counters that limit
          how fast an account can post, to stop spam.
        </li>
      </ul>
      <p>
        We do not use advertising, analytics trackers or third-party cookies.
        The only cookies are the ones that keep you signed in.
      </p>

      <h2>How we use it</h2>
      <ul>
        <li>To run your account and show your posts to other members.</li>
        <li>To generate AI replies to your questions.</li>
        <li>To match you with another member in Connect and deliver messages.</li>
        <li>
          To keep TeliTol safe: reviewing reports, hiding harmful posts,
          suspending accounts that break the{" "}
          <Link to="/terms" className="text-green underline">
            Terms of Use
          </Link>
          , and limiting spam.
        </li>
        <li>To send password-reset emails you ask for.</li>
      </ul>
      <p>We do not sell your personal data.</p>

      <h2>Who we share it with</h2>
      <p>
        We use these service providers to run TeliTol. They process data only
        on our behalf:
      </p>
      <ul>
        <li>
          <strong>Vercel</strong> hosts the website and app server.
        </li>
        <li>
          <strong>Neon</strong> hosts our database.
        </li>
        <li>
          <strong>Vercel Blob</strong> stores uploaded photos and files.
        </li>
        <li>
          <strong>AI providers</strong> (Groq, Google Gemini, OpenAI or xAI,
          whichever is available) receive your AI question and up to the last
          10 messages of that chat, including text read from documents you
          attached there, to write a reply. They do not receive your
          name or email address.
        </li>
        <li>
          <strong>Ably</strong> delivers Connect messages in real time.
        </li>
        <li>
          <strong>Resend</strong> sends password-reset emails.
        </li>
        <li>
          <strong>Google and X</strong>, only if you choose to sign in with
          them.
        </li>
      </ul>
      <p>
        These providers may store data outside your country, including in the
        United States and the European Union. We may also disclose data if the
        law requires it, or to protect someone in immediate danger.
      </p>

      <h2>How long we keep it</h2>
      <ul>
        <li>
          Account, profile, posts and AI chats: until you delete them or delete
          your account.
        </li>
        <li>
          Connect chats, including photos sent in them: deleted automatically
          after 7 days.
        </li>
        <li>
          Photos and files from deleted posts, and ones uploaded but never
          posted:
          deleted within about a day.
        </li>
        <li>
          Moderation decisions: kept as a record of how reports were handled.
        </li>
      </ul>

      <h2>Your choices and rights</h2>
      <ul>
        <li>Change your display name on the You page.</li>
        <li>Delete any question you asked.</li>
        <li>
          Delete your whole account in the app (You → Delete account) or on
          the{" "}
          <Link to="/delete-account" className="text-green underline">
            Delete account
          </Link>{" "}
          page. This permanently removes your profile, posts, photos, files, AI
          chats, Connect chats and sign-in details.
        </li>
        <li>
          Ask us for a copy of your data, or to correct it, using the contact
          below.
        </li>
      </ul>

      <h2>Age</h2>
      <p>
        TeliTol is for people aged {MIN_AGE} and over. We don't knowingly
        collect data from anyone younger. If you believe a child is using
        TeliTol, contact us and we will delete the account.
      </p>

      <h2>Security</h2>
      <p>
        Data travels over encrypted connections (HTTPS). Passwords are hashed,
        and sign-in tokens from Google and X are encrypted. No system is
        perfectly secure, so please use a password you don't use anywhere else.
      </p>

      <h2>Changes</h2>
      <p>
        If we change this policy, we will update the date at the top, and tell
        you in the app when the change is significant.
      </p>

      <h2>Contact</h2>
      <ContactLine prefix="Questions about your privacy? Email us at" />
    </PublicPage>
  );
}
