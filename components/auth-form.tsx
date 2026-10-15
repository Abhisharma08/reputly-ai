"use client";
import Link from "next/link";

import { useState, type FormEvent } from "react";
import Brand from "./brand";
import { api, errorMessage } from "@/lib/client";
export default function AuthForm({
  mode,
  enabled = true,
}: {
  mode: "login" | "signup" | "reset" | "password";
  enabled?: boolean;
}) {
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [terms, setTerms] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await api<{ next?: string; message?: string }>(
        `auth/${mode}`,
        "POST",
        mode === "signup"
          ? { name, email, password, terms_accepted: terms }
          : mode === "reset"
            ? { email }
            : mode === "password"
              ? { password }
              : { email, password },
      );
      if (data.next) {
        const next = new URLSearchParams(window.location.search).get("next");
        window.location.assign(
          next && next.startsWith("/invite?token=") ? next : data.next,
        );
      } else setNotice(data.message || "Done.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const title = {
    login: "Welcome back.",
    signup: "Give your business a voice.",
    reset: "Reset your password.",
    password: "Choose a new password.",
  }[mode];
  return (
    <div className="auth-page">
      <Brand />
      <section className="panel">
        <span className="eyebrow">YOUR REPUTLY ACCOUNT</span>
        <h1>{title}</h1>
        <p>
          {mode === "signup"
            ? "Start a 14-day trial. No payment details needed."
            : "Sign in to your business workspace."}
        </p>
        {!enabled && (
          <p className="info-note">
            Live accounts need the local environment configuration. See the
            setup guide in the project’s README. You can explore the guest demo
            now.
          </p>
        )}
        <form className="form-stack" onSubmit={submit}>
          {mode === "signup" && (
            <label>
              Your name
              <input
                required
                autoComplete="name"
                minLength={2}
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          )}
          {mode !== "password" && (
            <label>
              Email
              <input
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          )}
          {mode !== "reset" && (
            <label>
              Password
              <input
                type="password"
                required
                minLength={mode === "login" ? 1 : 12}
                maxLength={128}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {mode !== "login" && <small>Use at least 12 characters.</small>}
            </label>
          )}
          {mode === "signup" && (
            <label className="checkbox-label">
              <input
                type="checkbox"
                required
                checked={terms}
                onChange={(e) => setTerms(e.target.checked)}
              />
              <span>
                I agree to the <Link href="/terms">terms</Link> and{" "}
                <Link href="/privacy">privacy policy</Link>.
              </span>
            </label>
          )}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="info-note">
              {notice}
            </p>
          )}
          <button disabled={busy || !enabled} className="button primary full">
            {busy
              ? "Please wait…"
              : {
                  login: "Sign in",
                  signup: "Create account",
                  reset: "Send reset link",
                  password: "Update password",
                }[mode]}
          </button>
        </form>
        {["login", "signup"].includes(mode) && (
          <>
            <a
              href={`/api/v1/auth/google${typeof window !== "undefined" ? window.location.search : ""}`}
              className="button secondary full"
              aria-disabled={!enabled}
            >
              Continue with Google
            </a>
            <p>
              <a
                href={mode === "login" ? "/signup" : "/login"}
                className="text-link"
              >
                {mode === "login"
                  ? "Create an account"
                  : "Already registered? Sign in"}
              </a>
            </p>
            <Link href="/reset-password?request=1" className="text-link">
              Forgot your password?
            </Link>
          </>
        )}
        <hr />
        <Link href="/demo" className="button secondary full">
          Explore the guest demo
        </Link>
        {mode === "password" && (
          <Link href="/app" className="text-link">
            Open workspace →
          </Link>
        )}
      </section>
    </div>
  );
}
