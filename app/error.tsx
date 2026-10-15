"use client";
import Link from "next/link";
export default function ApplicationError({ retry, reset }: { retry?: () => void; reset: () => void }) {
  return <main className="auth-page"><section className="panel" role="alert"><h1>We couldn’t load this page.</h1><p>Try again in a moment. If the problem continues, return to your workspace.</p><button className="button primary full" onClick={retry || reset}>Try again</button><Link className="button secondary full" href="/app">Back to workspace</Link></section></main>;
}
