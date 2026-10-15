"use client";
import Link from "next/link";

import { useEffect, useState } from "react";
import Brand from "./brand";
import { api, errorMessage, ClientError } from "@/lib/client";
import { QR, InfoNote } from "./primitives";
type Overview = {
  errors: {
    request_id: string;
    route: string;
    error_code: string;
    created_at: string;
  }[];
  organizations: {
    id: string;
    name: string;
    country_code: string;
    status: string;
    created_at: string;
  }[];
  billing_events: {
    id: string;
    event_type: string;
    status: string;
    received_at: string;
  }[];
  audit_logs: {
    id: string;
    action: string;
    entity_type: string;
    created_at: string;
  }[];
  usage: {
    organization_id: string;
    ai_requests: number;
    period_start: string;
  }[];
  subscriptions: {
    organization_id: string;
    status: string;
    current_period_end: string | null;
  }[];
};
export default function AdminConsole() {
  const [data, setData] = useState<Overview | null>(null),
    [error, setError] = useState(""),
    [factors, setFactors] = useState<
      { id: string; friendly_name: string; status: string }[]
    >([]),
    [factor, setFactor] = useState(""),
    [uri, setUri] = useState(""),
    [secret, setSecret] = useState(""),
    [code, setCode] = useState(""),
    [busy, setBusy] = useState(false),
    [denied, setDenied] = useState(false);
  async function load() {
    try {
      setData(await api<Overview>("admin/overview"));
      setError("");
    } catch (e) {
      if (e instanceof ClientError && e.code === "MFA_REQUIRED")
        setError("Verify your authenticator to open administration.");
      else {
        setDenied(true);
        setError(errorMessage(e));
      }
    }
    const d = await api<{ factors: typeof factors }>("auth/mfa/list");
    setFactors(d.factors);
    setFactor(d.factors.find((f) => f.status === "verified")?.id || "");
  }
  useEffect(() => {
    // Synchronize the loading state with an external request; results are applied asynchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load().catch((e) => setError(errorMessage(e)));
  }, []);
  return (
    <div className="admin-page">
      <nav className="marketing-nav">
        <Brand />
        <Link href="/app" className="button secondary">
          Back to workspace
        </Link>
      </nav>
      <main className="main-content">
        <div className="page-heading">
          <div>
            <div className="eyebrow">RESTRICTED ACCESS</div>
            <h1>Administration</h1>
            <p>
              Privileged access requires an allowlisted account and an
              authenticator.
            </p>
          </div>
        </div>
        {error && (
          <p className="form-error live-alert" role="alert">
            {error}
          </p>
        )}
        {!data && (
          <section className="panel live-help">
            <h2>Verify your authenticator</h2>
            {denied && (
              <InfoNote>
                This account can manage its authenticator. Platform data
                requires administrator access.
              </InfoNote>
            )}
            {!factors.some((f) => f.status === "verified") && !uri && (
              <button
                className="button primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const f = await api<{
                      id: string;
                      uri: string;
                      secret: string;
                    }>("auth/mfa/enroll", "POST", {});
                    setFactor(f.id);
                    setUri(f.uri);
                    setSecret(f.secret);
                  } catch (e) {
                    setError(errorMessage(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Set up authenticator
              </button>
            )}
            {uri && (
              <>
                <p>
                  Scan this code with your authenticator app. The secret is
                  shown only during this setup.
                </p>
                <div className="mfa-qr">
                  <QR value={uri} size={220} />
                </div>
                <p className="mfa-secret">{secret}</p>
              </>
            )}
            {factor && (
              <form
                className="form-stack"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  try {
                    await api("auth/mfa/verify", "POST", {
                      factor_id: factor,
                      code,
                    });
                    setSecret("");
                    setUri("");
                    setCode("");
                    await load();
                  } catch (e) {
                    setError(errorMessage(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <label>
                  Authenticator code
                  <input
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    minLength={6}
                    maxLength={6}
                    autoComplete="one-time-code"
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </label>
                <button className="button primary" disabled={busy}>
                  {busy ? "Verifying…" : "Verify code"}
                </button>
              </form>
            )}
          </section>
        )}
        {data && (
          <div className="admin-grid">
            <section className="panel table-scroll">
              <div className="panel-header">
                <h2>Organizations</h2>
                <button
                  className="button secondary"
                  onClick={() => void load()}
                >
                  Refresh
                </button>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Business</th>
                    <th>Market</th>
                    <th>Status</th>
                    <th>Billing</th>
                    <th>AI usage</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.organizations.map((o) => (
                    <tr key={o.id}>
                      <td>{o.name}</td>
                      <td>{o.country_code}</td>
                      <td>{o.status}</td>
                      <td>
                        {data.subscriptions.find(
                          (s) => s.organization_id === o.id,
                        )?.status || "—"}
                      </td>
                      <td>
                        {data.usage
                          .filter((u) => u.organization_id === o.id)
                          .reduce((a, u) => a + Number(u.ai_requests), 0)}
                      </td>
                      <td>
                        {o.status !== "deleting" && (
                          <button
                            className="button secondary"
                            onClick={async () => {
                              const reason = window.prompt(
                                `Reason to ${o.status === "active" ? "suspend" : "reactivate"} ${o.name}:`,
                              );
                              if (!reason) return;
                              try {
                                await api(`admin/orgs/${o.id}`, "PATCH", {
                                  status:
                                    o.status === "active"
                                      ? "suspended"
                                      : "active",
                                  reason,
                                });
                                await load();
                              } catch (e) {
                                setError(errorMessage(e));
                              }
                            }}
                          >
                            {o.status === "active" ? "Suspend" : "Reactivate"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section className="panel table-scroll">
              <div className="panel-header">
                <h2>Recent billing events</h2>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Received</th>
                    <th>Event</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.billing_events.map((e) => (
                    <tr key={e.id}>
                      <td>{new Date(e.received_at).toLocaleString()}</td>
                      <td>{e.event_type}</td>
                      <td>{e.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section className="panel table-scroll">
              <div className="panel-header">
                <h2>Audit trail</h2>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Action</th>
                    <th>Entity</th>
                  </tr>
                </thead>
                <tbody>
                  {data.audit_logs.map((a) => (
                    <tr key={a.id}>
                      <td>{new Date(a.created_at).toLocaleString()}</td>
                      <td>{a.action}</td>
                      <td>{a.entity_type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section className="panel table-scroll">
              <div className="panel-header">
                <h2>Recent service errors</h2>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Route</th>
                    <th>Code</th>
                    <th>Request ID</th>
                  </tr>
                </thead>
                <tbody>
                  {data.errors.map((e) => (
                    <tr key={e.request_id}>
                      <td>{new Date(e.created_at).toLocaleString()}</td>
                      <td>{e.route}</td>
                      <td>{e.error_code}</td>
                      <td>{e.request_id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            <InfoNote>
              Review narratives and drafts are not stored. Provider failures are
              logged with request IDs and error codes in the application’s
              server logs.
            </InfoNote>
          </div>
        )}
      </main>
    </div>
  );
}
