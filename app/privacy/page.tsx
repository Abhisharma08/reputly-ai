
import Link from "next/link";
import Brand from "@/components/brand";
export default function Privacy() {
  return (
    <div className="legal-page">
      <Brand />
      <main>
        <span className="eyebrow">YOUR DATA</span>
        <h1>Your experience stays yours.</h1>
        <p>
          Reputly provides QR pages, optional writing assistance and aggregate
          engagement analytics. This notice describes the application’s data
          handling. The operator must publish its identity, support contact and
          applicable regional disclosures before opening live subscriptions.
        </p>
        <h2>Accounts and business workspaces</h2>
        <p>
          Supabase handles sign-in, email verification and account recovery. We
          store your business settings, memberships, assigned locations, QR
          configuration and subscription state. Account cookies keep you signed
          in and are protected from browser scripts. Cashfree hosts payment and
          mandate details; Reputly stores transaction references and integer
          amounts, never card numbers or security codes.
        </p>
        <h2>Your review text</h2>
        <p>
          Customer narratives and drafts stay in page memory and are not written
          to Reputly’s database, local storage, analytics or application logs.
          When AI is enabled, selecting stars sends your rating and any details
          you entered to our configured provider, Google Gemini or OpenAI, to
          draft and verify wording. OpenAI requests use storage disabled. The
          provider’s own processing terms still apply. Reputly does not use
          customer review text for model training. Leaving or reloading the page
          clears your text.
        </p>
        <p>
          Google’s unpaid Gemini services may use inputs and responses to
          improve products and may involve human review. Its paid-service data
          handling differs. Do not include sensitive personal details. See{" "}
          <a
            href="https://ai.google.dev/gemini-api/terms"
            target="_blank"
            rel="noopener noreferrer"
          >
            Google’s Gemini API terms
          </a>
          .
        </p>
        <h2>Anonymous engagement</h2>
        <p>
          When Google business lookup is configured, Reputly requests current
          company details from Google Maps when previewing a location or
          generating suggestions. These details stay in request memory and
          supply business context to the AI provider. Your selected experience
          highlights and previous options may also be sent to help produce
          relevant, varied wording. See{" "}
          <a href="https://policies.google.com/privacy">Google’s Privacy Policy</a>.
        </p>
        <p>
          We count page opens, writing starts, completed drafts, copy actions
          and deliberate Google link clicks. Random session tokens expire after
          24 hours. Rate limiting uses a daily rotating hash derived from the
          connection address; raw addresses are not stored in application
          tables. Technical hosting logs may independently include connection
          metadata.
        </p>
        <h2>Retention</h2>
        <p>
          Scheduled maintenance removes expired public sessions after a further
          48 hours, event records and AI usage metadata after 90 days, and daily
          aggregates and audit logs after 24 months. Payment records remain for
          the merchant’s applicable accounting retention requirements. These
          schedules require the operator to run the documented maintenance job.
          Backups can retain deleted records until their own retention period
          ends.
        </p>
        <h2>Export and deletion</h2>
        <p>
          Workspace admins can download locations, QR metadata, members and
          aggregate analytics from Settings. Business deletion immediately
          disables its QR pages and schedules operational removal after 30 days
          and confirmed provider cancellation. Account deletion also schedules
          removal of your Supabase sign-in identity; payment records can remain
          without account contact details.
        </p>
        <h2>The guest demo</h2>
        <p>
          The /demo workspace uses sample data and saves edits in this browser
          only. It has no live payment, invitation or AI calls. Its sample
          customer text remains in memory. Demo settings let you export or reset
          local data.
        </p>
        <h2>Your choice on Google</h2>
        <p>
          Copying and opening Google require your deliberate action. Google’s
          privacy terms apply when you visit its review page. Reputly never
          posts on your behalf.
        </p>
        <Link className="button primary" href="/app/settings">
          Manage your data
        </Link>
      </main>
    </div>
  );
}
