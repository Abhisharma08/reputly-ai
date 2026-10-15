import Link from "next/link";
export default function NotFound() {
  return <main className="auth-page"><section className="panel"><h1>Page not found</h1><p>This link may have changed. Your workspace is a good place to start.</p><Link href="/app" className="button primary">Open workspace</Link></section></main>;
}
