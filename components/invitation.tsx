"use client";
import Link from "next/link";

import { useEffect, useState } from "react";
import Brand from "./brand";
import { api, errorMessage, ClientError } from "@/lib/client";
export default function Invitation() {
  const [token, setToken] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [needsLogin, setNeedsLogin] = useState(false);
  useEffect(() => {
    // Hydrate browser-only state after SSR; the server cannot read browser storage or URL tokens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToken(new URLSearchParams(window.location.search).get("token") || "");
  }, []);
  async function accept() {
    setBusy(true);
    try {
      await api("invitations/accept", "POST", { token });
      window.location.assign("/app");
    } catch (e) {
      setError(errorMessage(e));
      setNeedsLogin(
        e instanceof ClientError &&
          ["AUTH_REQUIRED", "EMAIL_NOT_VERIFIED"].includes(e.code),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <Brand />
      <div className="panel">
        <h1>Join your team.</h1>
        <p>
          Sign in with the email address that received this invitation. It gives
          access to your assigned locations.
        </p>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button
          className="button primary full"
          disabled={!token || busy}
          onClick={accept}
        >
          {busy ? "Checking invitation…" : "Accept invitation"}
        </button>
        {needsLogin && (
          <a
            className="button secondary full"
            href={`/login?next=${encodeURIComponent("/invite?token=" + token)}`}
          >
            Sign in to accept
          </a>
        )}
        <Link href="/signup" className="text-link">
          Create an account first →
        </Link>
      </div>
    </div>
  );
}
