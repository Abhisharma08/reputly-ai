import Brand from "@/components/brand";
export default function Terms() {
  return (
    <div className="legal-page">
      <Brand />
      <main>
        <span className="eyebrow">SERVICE TERMS</span>
        <h1>Built around honest experiences.</h1>
        <p>
          Reputly offers branded QR pages, optional AI editing and engagement
          analytics. These product terms must be supplemented by the operator’s
          legal identity, contact, tax and refund disclosures before live
          billing is enabled.
        </p>
        <h2>Respect every voice</h2>
        <p>
          Describe real firsthand experiences. Do not fabricate reviews, offer
          review-linked rewards or restrict access to Google based on sentiment
          or ratings. Customers choose whether and what to publish. Writing
          assistance can be inaccurate; customers must check and edit its
          suggestions.
        </p>
        <h2>Business configuration</h2>
        <p>
          Use only your intended business’s official Google review destination.
          Preview and confirm it before activation. Confirmation does not verify
          ownership of a Google listing. Keep account access and staff
          assignments current.
        </p>
        <h2>Trial and subscriptions</h2>
        <p>
          Google Maps business information is subject to the{" "}
          <a href="https://maps.google.com/help/terms_maps/">Google Maps terms of service</a>.
        </p>
        <p>
          New workspaces receive a 14-day trial with plan limits. INR monthly
          subscriptions use Cashfree after the merchant enables billing. The
          exact plan amount and recurring schedule are shown before
          authorization. Mandate authorization is separate from a successful
          recurring charge; paid access requires a verified charge. Future
          renewals can be cancelled from billing, with access retained through
          the confirmed paid period. Failed renewals can receive a three-day
          grace period. Upgrades and downgrades take place after cancellation
          and the current paid period; no automatic proration is offered.
        </p>
        <h2>Payments and refunds</h2>
        <p>
          Cashfree hosts authorization and payment details. Reputly records
          verified payment status and transaction references. The merchant must
          publish applicable tax treatment, invoice process, cancellation
          contact and refund policy before enabling live payments. Refund
          handling does not automatically alter the remaining service period.
        </p>
        <h2>Availability and analytics</h2>
        <p>
          AI assistance is subject to quotas, rate limits and provider
          availability. Your original words and the direct Google link remain
          usable when assistance fails. Counts are approximate engagement
          events; a Google click is not proof that a review was published.
        </p>
        <h2>Guest demo</h2>
        <p>
          The guest workspace is free and separate from business accounts. It
          uses sample metrics and browser-local settings; it never creates a
          live subscription or sends an invitation.
        </p>
        <h2>Deleting data</h2>
        <p>
          Settings provide exports and scheduled deletion. Business deletion
          disables its public QR pages immediately; operational removal follows
          after 30 days and cancellation of future provider charges. Accounting
          records remain subject to retention requirements.
        </p>
        <a href="/signup" className="button primary">
          Get started
        </a>
      </main>
    </div>
  );
}
