"use client";
import Link from "next/link";

import { useState } from "react";
import Brand from "./brand";
import { InfoNote } from "./primitives";
const plans = [
  { name: "Starter", inr: 399, usd: 9, locations: 1, ai: 500 },
  { name: "Growth", inr: 999, usd: 24, locations: 3, ai: 3000 },
  { name: "Business", inr: 2999, usd: 79, locations: 10, ai: 10000 },
];
export default function Pricing() {
  const [currency, setCurrency] = useState<"INR" | "USD">("INR");
  return (
    <div className="welcome-page">
      <nav className="marketing-nav">
        <Brand />
        <div>
          <Link href="/login">Sign in</Link>
          <Link href="/demo" className="button secondary">
            Explore demo
          </Link>
        </div>
      </nav>
      <main className="main-content">
        <div className="page-heading">
          <div>
            <span className="eyebrow">ROOM TO GROW</span>
            <h1>Good connections, at any size.</h1>
            <p>Start with a 14-day Growth trial. No payment details needed.</p>
          </div>
          <div className="segmented">
            <button
              className={currency === "INR" ? "selected" : ""}
              onClick={() => setCurrency("INR")}
            >
              INR ₹
            </button>
            <button
              className={currency === "USD" ? "selected" : ""}
              onClick={() => setCurrency("USD")}
            >
              USD $
            </button>
          </div>
        </div>
        <div className="pricing-grid">
          {plans.map((p) => (
            <article
              className={`panel pricing-card ${p.name === "Growth" ? "recommended" : ""}`}
              key={p.name}
            >
              <h3>{p.name}</h3>
              <div className="price">
                {currency === "INR" ? "₹" : "$"}
                {currency === "INR" ? p.inr : p.usd}
                <small>/ month</small>
              </div>
              <ul>
                <li>{p.locations} business locations</li>
                <li>{p.ai.toLocaleString()} AI attempts / month</li>
                <li>Branded QR codes & PNG / SVG downloads</li>
                <li>Engagement analytics</li>
                <li>English and Hindi customer flows</li>
                <li>Direct Google access for every rating</li>
              </ul>
              <Link className="button primary full" href="/signup">
                Start free trial
              </Link>
            </article>
          ))}
        </div>
        <InfoNote>
          Cashfree subscriptions are available for India in INR after merchant
          setup. USD prices are indicative for future international billing. No
          currency conversion is used in payment records. Direct Google access
          remains available when AI limits are reached.
        </InfoNote>
        <p className="field-help">
          Monthly subscription amounts are the listed charge amounts. Tax
          treatment and invoice requirements must be configured by the merchant
          before live billing.
        </p>
      </main>
    </div>
  );
}
