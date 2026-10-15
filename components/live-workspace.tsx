"use client";
import { useSidebarNavigation } from "@/hooks/use-sidebar-navigation";
import Link from "next/link";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  LayoutDashboard,
  MapPin,
  QrCode,
  Nfc,
  ChartNoAxesCombined,
  Users,
  CreditCard,
  Settings,
  Menu,
  X,
  Plus,
  ArrowUpRight,
  LogOut,
  Download,
  Printer,
  ShieldCheck,
} from "lucide-react";
import Brand from "./brand";
import NFCTags from "./nfc-tags";
import { Modal, QR, downloadQR, InfoNote, TrendChart } from "./primitives";
import { api, errorMessage } from "@/lib/client";
import type {
  Organization,
  Membership,
  LiveLocation,
  LiveQR,
  LiveBilling,
  Plan,
} from "@/lib/contracts";
import { downloadFile, csvCell, type DailyRow, sumRows } from "@/lib/model";
import type { GoogleBusinessProfile } from "@/lib/google-profile";
import GoogleProfilePreview from "./google-profile-preview";
import { validateReviewUrl } from "@/lib/validation";
type Identity = {
  user: { id: string; email?: string; name: string };
  memberships: Membership[];
};
type Snapshot = {
  public_base_url: string;
  organization: Organization;
  locations: LiveLocation[];
  codes: LiveQR[];
  role: string;
};
type EventRow = {
  location_id: string;
  day: string;
  event_type: string;
  event_count: number;
};
type Billing = {
  subscription: LiveBilling;
  usage: { ai_used: number; locations_used: number };
  payments: {
    id: string;
    provider_payment_id: string;
    amount_minor: number;
    currency: string;
    status: string;
    paid_at: string;
    invoice_url?: string;
  }[];
  checkout_enabled: boolean;
  pending_checkout: {
    provider_subscription_id: string;
    plan_id: string;
    status: string;
  } | null;
};
const nav = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "locations", label: "Locations", icon: MapPin },
  { key: "qr", label: "QR codes", icon: QrCode },
  { key: "nfc", label: "NFC tags", icon: Nfc },
  { key: "analytics", label: "Analytics", icon: ChartNoAxesCombined },
  { key: "team", label: "Team members", icon: Users, admin: true },
  { key: "billing", label: "Plans & billing", icon: CreditCard, admin: true },
  { key: "settings", label: "Settings", icon: Settings, admin: true },
];
const amount = (n: number, currency: string) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(n / 100);
function defaultDates() {
  const to = new Date().toISOString().slice(0, 10),
    d = new Date();
  d.setUTCDate(d.getUTCDate() - 29);
  return { from: d.toISOString().slice(0, 10), to };
}
export default function LiveWorkspace({
  section,
  identity,
}: {
  section: string;
  identity: Identity;
}) {
  const [org, setOrg] = useState(
      identity.memberships[0]?.organization_id || "",
    ),
    [data, setData] = useState<Snapshot | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [mobile, setMobile] = useState(false),
    [dialog, setDialog] = useState<"location" | "qr" | null>(null),
    [editLocation, setEditLocation] = useState<LiveLocation | null>(null),
    [editQR, setEditQR] = useState<LiveQR | null>(null),
    [revision, setRevision] = useState(0),
    [print, setPrint] = useState<LiveQR | null>(null);
  const [period, setPeriod] = useState("30"),
    [dates, setDates] = useState(defaultDates),
    [filter, setFilter] = useState(""),
    [channel, setChannel] = useState("all"),
    [eventRows, setEventRows] = useState<EventRow[]>([]),
    [metricsLoading, setMetricsLoading] = useState(false);
  const closeNavigation = useCallback(() => setMobile(false), []);
  useSidebarNavigation(mobile, closeNavigation);
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("reputly.current-org");
      if (identity.memberships.some((m) => m.organization_id === stored))
        // Hydrate browser-only state after SSR; the server cannot read browser storage or URL tokens.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setOrg(stored!);
    } catch {}
  }, [identity.memberships]);
  useEffect(() => {
    if (!org) {
      // Synchronize the loading state with an external request; results are applied asynchronously.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    setError("");
    try {
      sessionStorage.setItem("reputly.current-org", org);
    } catch {}
    api<Snapshot>(`orgs/${org}`)
      .then((v) => {
        if (live) setData(v);
      })
      .catch((e) => {
        if (live) setError(errorMessage(e));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [org, revision]);
  useEffect(() => {
    if (!org || !["overview", "analytics"].includes(section)) return;
    let live = true;
    // Synchronize the loading state with an external request; results are applied asynchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMetricsLoading(true);
    setEventRows([]);
    const q = new URLSearchParams({
      ...dates,
      ...(filter ? { location_id: filter } : {}),
      ...(channel !== "all" ? { channel } : {}),
    });
    api<{ rows: EventRow[] }>(`orgs/${org}/analytics?${q}`)
      .then((r) => {
        if (live) setEventRows(r.rows);
      })
      .catch((e) => {
        if (live) setError(errorMessage(e));
      })
      .finally(() => {
        if (live) setMetricsLoading(false);
      });
    return () => {
      live = false;
    };
  }, [org, section, dates, filter, channel, revision]);
  async function run(task: () => Promise<unknown>, success: string) {
    setError("");
    try {
      await task();
      setNotice(success);
      setRevision((n) => n + 1);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    }
  }
  function locationEditor(l?: LiveLocation) {
    setEditLocation(l || null);
    setDialog("location");
  }
  function qrEditor(q?: LiveQR) {
    setEditQR(q || null);
    setDialog("qr");
  }
  const rows: DailyRow[] = [];
  for (
    let date = new Date(dates.from + "T12:00:00Z");
    date <= new Date(dates.to + "T12:00:00Z") && rows.length < 367;
    date.setUTCDate(date.getUTCDate() + 1)
  )
    rows.push({
      date: date.toISOString().slice(0, 10),
      scans: 0,
      assisted: 0,
      completed: 0,
      copies: 0,
      handoffs: 0,
    });
  const keys: Record<string, keyof Omit<DailyRow, "date">> = {
    qr_opened: "scans",
    assist_started: "assisted",
    ai_draft_completed: "completed",
    copy_clicked: "copies",
    review_link_clicked: "handoffs",
  };
  for (const e of eventRows) {
    const row = rows.find((r) => r.date === e.day);
    if (row && keys[e.event_type])
      row[keys[e.event_type]] += Number(e.event_count);
  }
  const totals = sumRows(rows);
  const admin = data?.role === "organization_admin";
  const title = nav.find((n) => n.key === section)?.label || "Help & setup";
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const qrURL = (q: LiveQR) => `${data?.public_base_url || origin}/r/${q.slug}`;
  if (!org)
    return (
      <CreateOrganization onCreated={() => window.location.assign("/app")} />
    );
  return (
    <div className="app-shell enterprise-workspace">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {mobile && (
        <div className="sidebar-overlay" onClick={() => setMobile(false)} />
      )}
      <aside id="workspace-sidebar" className={`sidebar ${mobile ? "sidebar-open" : ""}`}>
        <div className="sidebar-brand">
          <Brand />
          <button
            className="icon-button mobile-only"
            onClick={() => setMobile(false)}
            aria-label="Close navigation"
          >
            <X />
          </button>
        </div>
        <label className="workspace-switch">
          <span className="workspace-avatar">
            <MapPin size={19} />
          </span>
          <select
            aria-label="Business workspace"
            value={org}
            onChange={(e) => {
              setData(null);
              setNotice("");
              setOrg(e.target.value);
              setFilter("");
            }}
          >
            {identity.memberships.map((m) => (
              <option key={m.organization_id} value={m.organization_id}>
                {m.organizations?.name || "Workspace"}
              </option>
            ))}
          </select>
        </label>
        <div className="nav-caption">WORKSPACE</div>
        <nav aria-label="Workspace navigation">
          {nav
            .filter((n) => !n.admin || admin)
            .map((n) => (
              <a
                key={n.key}
                className={`nav-item ${section === n.key ? "active" : ""}`}
                href={n.key === "overview" ? "/app" : `/app/${n.key}`}
                aria-current={section === n.key ? "page" : undefined}
              >
                <n.icon size={18} />
                <span>{n.label}</span>
              </a>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="trial-card">
            <div className="trial-title">
              <ShieldCheck size={17} />
              <strong>Your customers stay in control.</strong>
            </div>
            <p>Every rating has the same direct path to Google.</p>
            <Link href="/app/help">
              Our approach <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className="profile">
            <span className="avatar">
              {identity.user.name.slice(0, 2).toUpperCase()}
            </span>
            <span>
              <strong>{identity.user.name}</strong>
              <small>{admin ? "Workspace admin" : "Location manager"}</small>
            </span>
            <button
              className="icon-button"
              aria-label="Sign out"
              onClick={() =>
                void run(async () => {
                  await api("auth/logout", "POST", {});
                  window.location.assign("/login");
                }, "Signed out.")
              }
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-only"
              aria-label="Open navigation" aria-expanded={mobile} aria-controls="workspace-sidebar"
              onClick={() => setMobile(true)}
            >
              <Menu />
            </button>
            <span>Workspace / {title}</span>
          </div>
          <span className="demo-pill">Business account</span>
        </header>
        <main id="main-content" className="main-content" aria-busy={loading}>
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {data?.organization.name || "YOUR BUSINESS"}
              </div>
              <h1>
                {section === "overview"
                  ? "Your reputation, at a glance."
                  : title}
              </h1>
              <p>
                {section === "overview"
                  ? "See how customers are connecting with your business."
                  : section === "nfc" ? "Turn every customer touchpoint into an invitation to review." : "Manage your customer experience across every location."}
              </p>
            </div>
            {section === "locations" && admin && (
              <button
                className="button primary"
                onClick={() => locationEditor()}
              >
                <Plus size={17} />
                Add location
              </button>
            )}
            {section === "qr" && (
              <button
                className="button primary"
                onClick={() => qrEditor()}
                disabled={!data?.locations.length}
              >
                <Plus size={17} />
                Create QR code
              </button>
            )}
          </div>
          {error && (
            <div role="alert" className="form-error live-alert">
              {error}
              <button
                className="text-button"
                onClick={() => setRevision((n) => n + 1)}
              >
                Retry
              </button>
            </div>
          )}
          {notice && (
            <div role="status" className="info-note live-alert">
              {notice}
              <button
                className="icon-button"
                aria-label="Dismiss message"
                onClick={() => setNotice("")}
              >
                <X size={15} />
              </button>
            </div>
          )}
          {loading && !data ? (
            <section className="panel empty-state" role="status">
              Loading your workspace…
            </section>
          ) : (
            data && (
              <>
                {["overview", "analytics"].includes(section) && (
                  <>
                    <div className="filter-bar">
                      <div className="filter-group">
                        <label className="select-wrap"><select aria-label="Link channel" value={channel} onChange={e => setChannel(e.target.value)}><option value="all">All channels</option><option value="qr">QR links</option><option value="nfc">NFC links</option></select></label>
                        <label className="select-wrap">
                          <select
                            aria-label="Filter location"
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                          >
                            <option value="">All accessible locations</option>
                            {data.locations.map((l) => (
                              <option key={l.id} value={l.id}>
                                {l.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="select-wrap">
                          <select
                            aria-label="Report period"
                            value={period}
                            onChange={(e) => {
                              setPeriod(e.target.value);
                              if (e.target.value !== "custom") {
                                const d = new Date();
                                d.setUTCDate(
                                  d.getUTCDate() - Number(e.target.value) + 1,
                                );
                                setDates({
                                  from: d.toISOString().slice(0, 10),
                                  to: new Date().toISOString().slice(0, 10),
                                });
                              }
                            }}
                          >
                            <option value="7">Last 7 days</option>
                            <option value="30">Last 30 days</option>
                            <option value="custom">Custom</option>
                          </select>
                        </label>
                        <div className="date-inputs">
                          <input
                            type="date"
                            aria-label="Report start date"
                            value={dates.from}
                            max={dates.to}
                            onChange={(e) => {
                              setPeriod("custom");
                              setDates({ ...dates, from: e.target.value });
                            }}
                          />
                          <input
                            type="date"
                            aria-label="Report end date"
                            value={dates.to}
                            min={dates.from}
                            onChange={(e) => {
                              setPeriod("custom");
                              setDates({ ...dates, to: e.target.value });
                            }}
                          />
                        </div>
                      </div>
                      <button
                        className="button secondary"
                        disabled={metricsLoading}
                        onClick={() =>
                          downloadFile(
                            [
                              "date,qr_opened,assist_started,ai_draft_completed,copy_clicked,review_link_clicked",
                              ...rows.map((r) =>
                                [
                                  r.date,
                                  r.scans,
                                  r.assisted,
                                  r.completed,
                                  r.copies,
                                  r.handoffs,
                                ]
                                  .map(csvCell)
                                  .join(","),
                              ),
                            ].join("\n"),
                            "reputly-analytics.csv",
                            "text/csv",
                          )
                        }
                      >
                        <Download size={15} />
                        Export CSV
                      </button>
                    </div>
                    <div className="live-stats">
                      {[
                        ["Review link opens", totals.scans],
                        ["AI drafts", totals.completed],
                        ["Google link clicks", totals.handoffs],
                        ["Copy clicks", totals.copies],
                      ].map(([label, value]) => (
                        <article className="panel live-stat" key={label}>
                          <span>{label}</span>
                          <strong>
                            {metricsLoading
                              ? "…"
                              : Number(value).toLocaleString("en-IN")}
                          </strong>
                          <small>Recorded events in this period</small>
                        </article>
                      ))}
                    </div>
                    <section className="panel">
                      <div className="panel-header">
                        <div>
                          <h2>Customer connections</h2>
                          <p>Review link opens and deliberate Google handoffs.</p>
                        </div>
                        <span className="status">
                          {metricsLoading ? "Updating…" : "Recorded events"}
                        </span>
                      </div>
                      <TrendChart
                        rows={rows}
                        label="Customer engagement: recorded review link opens and Google link clicks"
                      />
                      <InfoNote>
                        Google link clicks are handoffs, not confirmed published
                        reviews. Dates follow each location’s timezone. Repeat
                        events within five minutes are deduplicated.
                      </InfoNote>
                    </section>
                    {section === "overview" && data.locations.length > 0 && (
                      <section className="panel live-section table-scroll">
                        <div className="panel-header">
                          <h2>Across your locations</h2>
                        </div>
                        <table>
                          <thead>
                            <tr>
                              <th>Location</th>
                              <th>Link opens</th>
                              <th>Google clicks</th>
                              <th>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.locations
                              .filter((l) => !filter || l.id === filter)
                              .map((l) => (
                                <tr key={l.id}>
                                  <td>{l.name}</td>
                                  <td>
                                    {eventRows
                                      .filter(
                                        (e) =>
                                          e.location_id === l.id &&
                                          e.event_type === "qr_opened",
                                      )
                                      .reduce(
                                        (n, e) => n + Number(e.event_count),
                                        0,
                                      )}
                                  </td>
                                  <td>
                                    {eventRows
                                      .filter(
                                        (e) =>
                                          e.location_id === l.id &&
                                          e.event_type ===
                                            "review_link_clicked",
                                      )
                                      .reduce(
                                        (n, e) => n + Number(e.event_count),
                                        0,
                                      )}
                                  </td>
                                  <td>{l.status}</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </section>
                    )}
                    {section === "analytics" && (
                      <section className="panel table-scroll live-section">
                        <table>
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Opens</th>
                              <th>Assist starts</th>
                              <th>AI drafts</th>
                              <th>Copies</th>
                              <th>Google clicks</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows
                              .slice()
                              .reverse()
                              .map((r) => (
                                <tr key={r.date}>
                                  <td>{r.date}</td>
                                  <td>{r.scans}</td>
                                  <td>{r.assisted}</td>
                                  <td>{r.completed}</td>
                                  <td>{r.copies}</td>
                                  <td>{r.handoffs}</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </section>
                    )}
                    {section === "overview" && !data.locations.length && (
                      <section className="panel empty-state live-section">
                        <MapPin size={32} />
                        <h2>Your first connection starts here.</h2>
                        <p>
                          Add a location, confirm its Google review link, then
                          create a QR.
                        </p>
                        {admin && (
                          <button
                            className="button primary"
                            onClick={() => locationEditor()}
                          >
                            Add your first location
                          </button>
                        )}
                      </section>
                    )}
                  </>
                )}
                {section === "locations" && (
                  <section className="panel table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Location</th>
                          <th>Locale & timezone</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.locations.map((l) => (
                          <tr key={l.id}>
                            <td>
                              <strong>{l.name}</strong>
                              <p>
                                {l.category} · {l.address}
                              </p>
                            </td>
                            <td>
                              {l.locale}
                              <p>{l.timezone}</p>
                            </td>
                            <td>
                              <span
                                className={`status ${l.status === "active" ? "" : "paused"}`}
                              >
                                {l.status}
                              </span>
                            </td>
                            <td>
                              <button
                                className="button secondary"
                                onClick={() => locationEditor(l)}
                              >
                                Edit
                              </button>
                              {admin && l.status !== "archived" && (
                                <button
                                  className="text-button"
                                  onClick={() =>
                                    void run(
                                      () =>
                                        api(
                                          `orgs/${org}/locations/${l.id}`,
                                          "DELETE",
                                        ),
                                      "Location archived. Its QR pages are inactive.",
                                    )
                                  }
                                >
                                  Archive
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!data.locations.length && (
                      <div className="empty-state">
                        No locations yet. Add one to begin.
                      </div>
                    )}
                  </section>
                )}
                {section === "qr" && (
                  <>
                    <div className="qr-grid">
                      {data.codes.filter(q => q.channel !== "nfc").map((q) => (
                        <article className="panel qr-card" key={q.id}>
                          <div className="qr-card-top">
                            <span className="status">
                              {q.is_active ? "Enabled" : "Paused"}
                            </span>
                            <span>
                              {
                                data.locations.find(
                                  (l) => l.id === q.location_id,
                                )?.name
                              }
                            </span>
                          </div>
                          <div className="qr-card-preview">
                            <QR value={qrURL(q)} size={156} />
                          </div>
                          <div className="qr-card-content">
                            <h2>{q.label}</h2>
                            <p>
                              Public URL stays stable when you edit the
                              destination.
                            </p>
                            <div className="qr-card-actions">
                              <button
                                className="button secondary"
                                onClick={() =>
                                  void run(
                                    () => downloadQR(qrURL(q), q.label, "png"),
                                    "QR PNG downloaded.",
                                  )
                                }
                              >
                                PNG
                              </button>
                              <button
                                className="button secondary"
                                onClick={() =>
                                  void run(
                                    () => downloadQR(qrURL(q), q.label, "svg"),
                                    "QR SVG downloaded.",
                                  )
                                }
                              >
                                SVG
                              </button>
                              <button
                                className="button secondary"
                                onClick={() => setPrint(q)}
                              >
                                <Printer size={15} />
                                Print
                              </button>
                            </div>
                            <div className="qr-card-footer">
                              <a
                                className="text-link"
                                href={`/r/${q.slug}`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Customer page <ArrowUpRight size={14} />
                              </a>
                              <button
                                className="text-button"
                                onClick={() => qrEditor(q)}
                              >
                                Customize
                              </button>
                            </div>
                            <button
                              className="text-button"
                              onClick={() =>
                                void run(
                                  () =>
                                    api(`orgs/${org}/qr/${q.id}`, "PATCH", {
                                      is_active: !q.is_active,
                                    }),
                                  q.is_active ? "QR paused." : "QR enabled.",
                                )
                              }
                            >
                              {q.is_active ? "Pause" : "Enable"}
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                    {!data.codes.some(q => q.channel !== "nfc") && (
                      <section className="panel empty-state">
                        <QrCode size={32} />
                        <h2>Make the invitation.</h2>
                        <p>
                          Create a QR code for a location. It works publicly
                          once that location is active.
                        </p>
                      </section>
                    )}
                    <InfoNote>
                      Test the QR on another device before printing. Draft and
                      archived locations cannot be opened by customers.
                    </InfoNote>
                  </>
                )}
                {section === "nfc" && <NFCTags key={org} org={org} codes={data.codes} locations={data.locations} origin={data.public_base_url || origin} onSaved={() => setRevision(n => n + 1)} />}
                {section === "billing" &&
                  (admin ? (
                    <LiveBillingView
                      org={org}
                      notify={setNotice}
                      onError={setError}
                    />
                  ) : (
                    <InfoNote>
                      Billing is available to workspace admins.
                    </InfoNote>
                  ))}
                {section === "team" &&
                  (admin ? (
                    <LiveTeam
                      org={org}
                      locations={data.locations}
                      notify={setNotice}
                      onError={setError}
                    />
                  ) : (
                    <InfoNote>
                      Team settings are available to workspace admins.
                    </InfoNote>
                  ))}
                {section === "settings" && admin && (
                  <LiveSettings
                    org={data.organization}
                    email={identity.user.email || ""}
                    onError={setError}
                    notify={setNotice}
                  />
                )}
                {!nav.some((n) => n.key === section) && (
                  <section className="panel live-help">
                    <h2>Make your first customer connection.</h2>
                    <ol>
                      <li>
                        Add a location and its official Google review link.
                      </li>
                      <li>
                        Preview and confirm the destination, then activate the
                        location.
                      </li>
                      <li>
                        Create a QR and download or print its display card.
                      </li>
                      <li>
                        Follow recorded opens, drafts, copies, and Google
                        handoffs.
                      </li>
                    </ol>
                    <InfoNote>
                      Writing assistance edits a customer’s firsthand
                      experience. It never posts a review or restricts Google
                      access based on a rating.
                    </InfoNote>
                    <Link href="/demo" className="button secondary">
                      Explore the separate guest demo
                    </Link>
                  </section>
                )}
              </>
            )
          )}
          <footer className="app-footer">
            <span>Authentic experiences. Customer-led reviews.</span>
            <Link href="/privacy">Privacy</Link>
          </footer>
        </main>
      </div>
      {dialog === "location" && (
        <LocationEditor
          org={org}
          defaultCountry={data?.organization.country_code || "IN"}
          location={editLocation}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            setNotice("Location saved.");
            setRevision((n) => n + 1);
          }}
        />
      )}
      {dialog === "qr" && data && (
        <QREditor
          org={org}
          qr={editQR}
          locations={data.locations}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            setNotice("QR saved.");
            setRevision((n) => n + 1);
          }}
        />
      )}
      {print && (
        <Modal title="Print your display card" onClose={() => setPrint(null)}>
          <div
            className="print-card"
            style={{ borderColor: print.brand_color }}
          >
            <h2>
              {data?.locations.find((l) => l.id === print.location_id)?.name}
            </h2>
            <p>{print.label}</p>
            <QR value={qrURL(print)} size={210} />
            <h3>Share your experience</h3>
            <p>Your experience. Your words.</p>
            <small>Powered by Reputly</small>
          </div>
          <button
            className="button primary full"
            onClick={() => window.print()}
          >
            Print / Save as PDF
          </button>
        </Modal>
      )}
    </div>
  );
}
function CreateOrganization({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState(""),
    [country, setCountry] = useState("IN"),
    [locale, setLocale] = useState("en"),
    [terms, setTerms] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [key] = useState(() => crypto.randomUUID());
  return (
    <div className="auth-page">
      <Brand />
      <section className="panel">
        <span className="eyebrow">YOUR FIRST WORKSPACE</span>
        <h1>Let’s get you set up.</h1>
        <p>Your workspace starts with a 14-day Growth trial.</p>
        <form
          className="form-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await api(
                "orgs",
                "POST",
                {
                  name,
                  country_code: country,
                  default_locale: locale,
                  terms_accepted: terms,
                },
                key,
              );
              onCreated();
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Business name
            <input
              required
              minLength={2}
              maxLength={160}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div className="form-two">
            <label>
              Country
              <select
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              >
                <option value="IN">India</option>
                <option value="US">United States</option>
              </select>
            </label>
            <label>
              Customer language
              <select
                value={locale}
                onChange={(e) => setLocale(e.target.value)}
              >
                <option value="en">English</option>
                <option value="hi">Hindi</option>
              </select>
            </label>
          </div>
          <InfoNote>
            Cashfree subscriptions are currently available for Indian workspaces
            in INR. Other markets can use the trial and direct Google flow.
          </InfoNote>
          <label className="checkbox-label">
            <input
              type="checkbox"
              required
              checked={terms}
              onChange={(e) => setTerms(e.target.checked)}
            />
            <span>
              I accept the <Link href="/terms">terms</Link> and{" "}
              <Link href="/privacy">privacy policy</Link>.
            </span>
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="button primary full" disabled={busy}>
            {busy ? "Creating workspace…" : "Create workspace"}
          </button>
        </form>
      </section>
    </div>
  );
}
function LocationEditor({
  org,
  defaultCountry,
  location,
  onClose,
  onSaved,
}: {
  org: string;
  location: LiveLocation | null;
  defaultCountry: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(location?.name || ""),
    [category, setCategory] = useState(location?.category || "Café"),
    [country, setCountry] = useState(location?.country_code || defaultCountry),
    [address, setAddress] = useState(location?.address || ""),
    [url, setUrl] = useState(location?.google_review_url || ""),
    [preview, setPreview] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [locale, setLocale] = useState(location?.locale || "en"),
    [timezone, setTimezone] = useState(
      location?.timezone ||
        (defaultCountry === "IN" ? "Asia/Kolkata" : "America/New_York"),
    ),
    [status, setStatus] = useState(location?.status || "draft"),
    [color, setColor] = useState(location?.brand_color || "#315b43"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [key] = useState(() => crypto.randomUUID());
  const [googleProfile, setGoogleProfile] =
    useState<GoogleBusinessProfile | null>(null);
  const [profileNotice, setProfileNotice] = useState("");
  const lookupVersion = useRef(0);
  const lookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    try {
      validateReviewUrl(url);
    } catch {
      return;
    }
    const timer = setTimeout(() => void check(), 700);
    lookupTimer.current = timer;
    return () => {
      clearTimeout(timer);
      lookupVersion.current++;
    };
  }, [url, org]);
  async function check() {
    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    lookupTimer.current = null;
    const version = ++lookupVersion.current;
    setBusy(true);
    setError("");
    try {
      const r = await api<{
        url: string;
        profile?: GoogleBusinessProfile | null;
        profile_status?: string;
      }>(`orgs/${org}/review-url`, "POST", {
        url,
      });
      if (version !== lookupVersion.current) return;
      setPreview(r.url);
      setGoogleProfile(r.profile || null);
      setProfileNotice(
        r.profile_status === "not_configured"
          ? "Google business lookup is not configured yet. You can still save and confirm the review link using your business details."
          : r.profile_status === "unavailable"
            ? "The review link is ready, but Google business details could not be loaded. You can still confirm the link and save your business details."
            : "Google business details will be loaded fresh for AI suggestions. Check your business name and category below before saving.",
      );
      setConfirmed(false);
    } catch (e) {
      if (version === lookupVersion.current) setError(errorMessage(e));
    } finally {
      if (version === lookupVersion.current) setBusy(false);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (url && !confirmed) {
      setError("Preview and confirm the intended Google destination.");
      return;
    }
    setBusy(true);
    try {
      await api(
        `orgs/${org}/locations${location ? "/" + location.id : ""}`,
        location ? "PATCH" : "POST",
        {
          name,
          category,
          address,
          google_review_url: preview || url,
          destination_confirmed: confirmed,
          status,
          locale,
          timezone,
          brand_color: color,
          country_code: country,
        },
        location ? undefined : key,
      );
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={location ? "Edit location" : "Add a location"}
      onClose={onClose}
    >
      <form className="form-stack" onSubmit={submit}>
        <label>
          Official Google review URL
          <input
            type="url"
            maxLength={2048}
            value={url}
            placeholder="https://g.page/r/…/review"
            onChange={(e) => {
              lookupVersion.current++;
              setBusy(false);
              setUrl(e.target.value);
              setPreview("");
              setConfirmed(false);
              setGoogleProfile(null);
              setProfileNotice("");
            }}
          />
        </label>
        <button
          type="button"
          className="button secondary"
          disabled={!url || busy}
          onClick={() => void check()}
        >
          {busy ? "Loading…" : "Load Google business"}
        </button>
        {googleProfile && <GoogleProfilePreview profile={googleProfile} />}
        {profileNotice && (
          <p className="field-help" role="status">
            {profileNotice}
          </p>
        )}
        <label>
          Business name
          <input
            required
            minLength={2}
            maxLength={160}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <div className="form-two">
          <label>
            Category
            <input
              required
              maxLength={50}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </label>
          <label>
            Status
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
            >
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </label>
        </div>
        <label>
          Country code
          <input
            required
            minLength={2}
            maxLength={2}
            pattern="[A-Z]{2}"
            value={country}
            onChange={(e) => setCountry(e.target.value.toUpperCase())}
          />
        </label>
        <label>
          Address
          <input
            maxLength={300}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </label>
        {preview && (
          <>
            <a
              href={preview}
              className="destination-url"
              target="_blank"
              rel="noopener noreferrer"
            >
              Open resolved Google destination ↗
            </a>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              <span>
                I checked the listing and confirm it is the intended business.
                This does not verify ownership.
              </span>
            </label>
          </>
        )}
        <div className="form-two">
          <label>
            Customer language
            <select value={locale} onChange={(e) => setLocale(e.target.value)}>
              <option value="en">English</option>
              <option value="hi">Hindi</option>
              <option value="en-IN">English (India)</option>
              <option value="hi-IN">Hindi (India)</option>
            </select>
          </label>
          <label>
            IANA timezone
            <input
              required
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            />
          </label>
        </div>
        <label>
          Brand accent
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </label>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <InfoNote>
          A draft can be saved without a Google link. Activate it only after
          checking and confirming the destination.
        </InfoNote>
        <div className="form-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button disabled={busy} className="button primary">
            {busy ? "Saving…" : "Save location"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
function QREditor({
  org,
  qr,
  locations,
  onClose,
  onSaved,
}: {
  org: string;
  qr: LiveQR | null;
  locations: LiveLocation[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [location, setLocation] = useState(
      qr?.location_id ||
        locations.find((l) => l.status !== "archived")?.id ||
        "",
    ),
    [label, setLabel] = useState(qr?.label || "Share your experience"),
    [color, setColor] = useState(qr?.brand_color || "#315b43"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [key] = useState(() => crypto.randomUUID());
  return (
    <Modal title={qr ? "Customize QR" : "Create QR"} onClose={onClose}>
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api(
              `orgs/${org}/qr${qr ? "/" + qr.id : ""}`,
              qr ? "PATCH" : "POST",
              {
                label,
                brand_color: color,
                ...(!qr ? { location_id: location } : {}),
              },
              qr ? undefined : key,
            );
            onSaved();
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Location
          <select
            disabled={!!qr}
            required
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          >
            <option value="">Choose a location</option>
            {locations
              .filter((l) => l.status !== "archived" || l.id === location)
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.status})
                </option>
              ))}
          </select>
        </label>
        <label>
          Display label
          <input
            required
            minLength={2}
            maxLength={70}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </label>
        <label>
          Brand accent
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </label>
        <InfoNote>
          Your QR URL is generated on the server and stays stable. Editing a
          location’s Google destination updates all its QR codes.
        </InfoNote>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary" disabled={busy || !location}>
          {busy ? "Saving…" : "Save QR"}
        </button>
      </form>
    </Modal>
  );
}
function LiveBillingView({
  org,
  notify,
  onError,
}: {
  org: string;
  notify: (s: string) => void;
  onError: (s: string) => void;
}) {
  const [data, setData] = useState<Billing | null>(null),
    [plans, setPlans] = useState<Plan[]>([]),
    [selected, setSelected] = useState<Plan | null>(null),
    [name, setName] = useState(""),
    [phone, setPhone] = useState(""),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [key, setKey] = useState(() => crypto.randomUUID());
  async function refresh() {
    const b = await api<Billing>(`orgs/${org}/billing`);
    setData(b);
    if (new URLSearchParams(window.location.search).has("returned")) {
      try {
        setData(await api<Billing>(`orgs/${org}/billing/refresh`, "POST", {}));
      } catch (e) {
        onError(errorMessage(e));
      }
    }
    setPlans(
      await api<Plan[]>(`plans?currency=${b.subscription.plans.currency}`),
    );
  }
  useEffect(() => {
    // Synchronize the loading state with an external request; results are applied asynchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(null);
    void refresh().catch((e) => onError(errorMessage(e)));
  }, [org]);
  async function checkout(e: FormEvent) {
    e.preventDefault();
    if (!selected || !consent) return;
    setBusy(true);
    try {
      const result = await api<{
        subscription_session_id: string;
        environment: "sandbox" | "production";
      }>(
        `orgs/${org}/billing/checkout`,
        "POST",
        {
          plan_code: selected.code,
          customer_phone: phone,
          customer_name: name,
        },
        key,
      );
      await loadCashfree();
      const cashfree = window.Cashfree!({ mode: result.environment });
      const checkout = await cashfree.subscriptionsCheckout({
        subsSessionId: result.subscription_session_id,
        redirectTarget: "_self",
      });
      if (checkout?.error)
        throw new Error("Cashfree checkout could not open. Please retry.");
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return <section className="panel empty-state">Loading billing…</section>;
  const s = data.subscription;
  const limit = s.plans;
  return (
    <>
      <section className="panel plan-summary">
        <div>
          <span className="eyebrow">YOUR SUBSCRIPTION</span>
          <h2>
            {limit.name} <span className="status">{s.status}</span>
          </h2>
          <p>
            {s.status === "trialing"
              ? `Trial ends ${new Date(s.trial_ends_at!).toLocaleDateString()}`
              : s.current_period_end
                ? `Paid period ends ${new Date(s.current_period_end).toLocaleDateString()}`
                : "No current paid period"}
          </p>
          <p>
            {s.grace_until
              ? `Grace period ends ${new Date(s.grace_until).toLocaleDateString()}`
              : ""}
          </p>
        </div>
        <div className="usage-block">
          <span>
            Locations{" "}
            <strong>
              {data.usage.locations_used} / {limit.location_limit}
            </strong>
          </span>
          <div className="usage-track">
            <i
              style={{
                width: `${Math.min(100, (100 * data.usage.locations_used) / limit.location_limit)}%`,
              }}
            />
          </div>
        </div>
        <div className="usage-block">
          <span>
            AI attempts this UTC month{" "}
            <strong>
              {data.usage.ai_used} / {limit.ai_monthly_limit}
            </strong>
          </span>
          <div className="usage-track">
            <i
              style={{
                width: `${Math.min(100, (100 * data.usage.ai_used) / limit.ai_monthly_limit)}%`,
              }}
            />
          </div>
        </div>
      </section>
      <div className="filter-bar">
        <p>Cashfree monthly subscriptions · {limit.currency}</p>
        <button
          className="button secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              setData(
                await api<Billing>(`orgs/${org}/billing/refresh`, "POST", {}),
              );
              notify("Billing status refreshed from Cashfree.");
            } catch (e) {
              onError(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          Refresh payment status
        </button>
      </div>
      {data.pending_checkout && (
        <InfoNote>
          A mandate checkout is pending. Authorization alone does not activate
          paid access. Reference:{" "}
          {data.pending_checkout.provider_subscription_id}. Resume the same plan
          or cancel future renewals below.
        </InfoNote>
      )}
      {!data.checkout_enabled && (
        <InfoNote>
          Checkout becomes available after Cashfree is configured. Your existing
          trial and direct Google access continue according to their limits.
        </InfoNote>
      )}
      <div className="pricing-grid">
        {plans.map((p) => (
          <article
            key={p.id}
            className={`panel pricing-card ${p.name === "Growth" ? "recommended" : ""}`}
          >
            <h3>{p.name}</h3>
            <div className="price">
              {amount(p.amount_minor, p.currency)}
              <small>/ month</small>
            </div>
            <ul>
              <li>{p.location_limit} locations</li>
              <li>{p.ai_monthly_limit.toLocaleString()} AI attempts / month</li>
              <li>Branded QR codes and downloads</li>
              <li>Analytics and English / Hindi flow</li>
            </ul>
            <button
              className="button primary full"
              disabled={
                !data.checkout_enabled ||
                p.currency !== "INR" ||
                (!!s.provider_subscription_id && s.status !== "expired")
              }
              onClick={() => {
                setSelected(p);
                setKey(crypto.randomUUID());
                setConsent(false);
              }}
            >
              Choose {p.name}
            </button>
          </article>
        ))}
      </div>
      <InfoNote>
        Only a confirmed recurring charge activates paid access. Mandate
        authorization and the checkout return page do not. Changing plans
        requires cancelling the current subscription and waiting until its paid
        period ends.
      </InfoNote>
      {(s.provider_subscription_id || data.pending_checkout) &&
        s.status !== "cancelled" &&
        s.status !== "expired" && (
          <button
            className="button secondary"
            disabled={busy}
            onClick={async () => {
              if (
                !window.confirm(
                  "Cancel future Cashfree renewals? Access remains through the confirmed paid period.",
                )
              )
                return;
              setBusy(true);
              try {
                const r = await api<{ message: string }>(
                  `orgs/${org}/billing/cancel`,
                  "POST",
                  {},
                );
                notify(r.message);
                await refresh();
              } catch (e) {
                onError(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {s.cancel_requested_at
              ? "Cancellation requested"
              : "Cancel future renewals"}
          </button>
        )}
      <section className="panel live-section table-scroll">
        <div className="panel-header">
          <h2>Payment history</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Amount</th>
              <th>Transaction</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.payments.map((p) => (
              <tr key={p.id}>
                <td>
                  {p.paid_at ? new Date(p.paid_at).toLocaleDateString() : "—"}
                </td>
                <td>{amount(p.amount_minor, p.currency)}</td>
                <td>{p.provider_payment_id}</td>
                <td>{p.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.payments.length && (
          <div className="empty-state compact">
            No confirmed recurring payments yet.
          </div>
        )}
      </section>
      {selected && (
        <Modal
          title={`Subscribe to ${selected.name}`}
          onClose={() => setSelected(null)}
        >
          <form className="form-stack" onSubmit={checkout}>
            <p>
              {amount(selected.amount_minor, selected.currency)} per month.
              Cashfree hosts the mandate and payment details.
            </p>
            <label>
              Billing name
              <input
                required
                minLength={2}
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Indian mobile number
              <input
                type="tel"
                inputMode="numeric"
                pattern="[6-9][0-9]{9}"
                maxLength={10}
                required
                placeholder="10 digits"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>
            <InfoNote>
              A ₹1 mandate authorization is requested with automatic refund. The
              first recurring charge is scheduled after your trial or at least
              24 hours from now. Review the schedule shown by Cashfree before
              authorizing.
            </InfoNote>
            <label className="checkbox-label">
              <input
                type="checkbox"
                required
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>
                I understand this is a recurring monthly subscription and agree
                to the <Link href="/terms">terms</Link>.
              </span>
            </label>
            <button className="button primary full" disabled={busy}>
              {busy ? "Opening Cashfree…" : "Continue to Cashfree"}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
type CashfreeSDK = {
  subscriptionsCheckout: (options: {
    subsSessionId: string;
    redirectTarget: string;
  }) => Promise<{ error?: unknown } | undefined>;
};
declare global {
  interface Window {
    Cashfree?: (options: { mode: "sandbox" | "production" }) => CashfreeSDK;
  }
}
let cashfreeLoader: Promise<void> | null = null;
function loadCashfree() {
  if (window.Cashfree) return Promise.resolve();
  if (cashfreeLoader) return cashfreeLoader;
  cashfreeLoader = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
    script.async = true;
    script.onload = () =>
      window.Cashfree
        ? resolve()
        : reject(new Error("Cashfree SDK is unavailable."));
    script.onerror = () =>
      reject(
        new Error("Cashfree checkout could not load. Check your connection."),
      );
    document.head.appendChild(script);
  });
  cashfreeLoader = cashfreeLoader.catch((e) => {
    cashfreeLoader = null;
    throw e;
  });
  return cashfreeLoader;
}
function LiveTeam({
  org,
  locations,
  notify,
  onError,
}: {
  org: string;
  locations: LiveLocation[];
  notify: (s: string) => void;
  onError: (s: string) => void;
}) {
  type Team = {
    members: {
      user_id: string;
      email: string;
      display_name: string;
      role: string;
      location_ids?: string[];
    }[];
    invitations: { id: string; email: string; expires_at: string }[];
  };
  const [data, setData] = useState<Team | null>(null),
    [email, setEmail] = useState(""),
    [assigned, setAssigned] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [link, setLink] = useState("");
  async function refresh() {
    setData(await api<Team>(`orgs/${org}/team`));
  }
  useEffect(() => {
    // Synchronize the loading state with an external request; results are applied asynchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh().catch((e) => onError(errorMessage(e)));
  }, [org]);
  return (
    <>
      <section className="panel table-scroll">
        <div className="panel-header">
          <h2>Your team</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Member</th>
              <th>Role</th>
              <th>Access</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {data?.members.map((m) => (
              <tr key={m.user_id}>
                <td>
                  <strong>{m.display_name || m.email}</strong>
                  <p>{m.email}</p>
                </td>
                <td>
                  {m.role === "organization_admin"
                    ? "Workspace admin"
                    : "Location manager"}
                </td>
                <td>
                  {m.role === "organization_admin"
                    ? "All locations"
                    : (m.location_ids || [])
                        .map((id) => locations.find((l) => l.id === id)?.name)
                        .filter(Boolean)
                        .join(", ") || "Assigned locations"}
                </td>
                <td>
                  {m.role === "location_manager" && (
                    <button
                      className="text-button"
                      onClick={async () => {
                        try {
                          await api(`orgs/${org}/team/${m.user_id}`, "DELETE");
                          await refresh();
                          notify("Member removed. Access is revoked.");
                        } catch (e) {
                          onError(errorMessage(e));
                        }
                      }}
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="panel live-section live-help">
        <h2>Invite a location manager</h2>
        <p>
          Managers can manage assigned locations and QR codes. Billing and
          business deletion stay with the admin.
        </p>
        <form
          className="form-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setLink("");
            try {
              const r = await api<{
                email_sent: boolean;
                invitation_url?: string;
              }>(`orgs/${org}/team/invite`, "POST", {
                email,
                location_ids: assigned,
              });
              setLink(r.invitation_url || "");
              notify(
                r.email_sent
                  ? "Invitation email sent."
                  : "Invitation created. Share the secure link with the intended recipient.",
              );
              setEmail("");
              await refresh();
            } catch (e) {
              onError(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Email
            <input
              type="email"
              maxLength={254}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <fieldset className="assignment-field">
            <legend>Assigned locations</legend>
            {locations
              .filter((l) => l.status !== "archived")
              .map((l) => (
                <label key={l.id} className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={assigned.includes(l.id)}
                    onChange={(e) =>
                      setAssigned(
                        e.target.checked
                          ? [...assigned, l.id]
                          : assigned.filter((id) => id !== l.id),
                      )
                    }
                  />
                  <span>{l.name}</span>
                </label>
              ))}
          </fieldset>
          <button
            className="button primary"
            disabled={busy || !assigned.length}
          >
            {busy ? "Creating…" : "Create invitation"}
          </button>
        </form>
        {link && (
          <div className="form-stack">
            <label>
              One-time invitation link
              <input readOnly value={link} onFocus={(e) => e.target.select()} />
            </label>
            <small>
              The recipient must sign in with the invited email. The link
              expires in seven days.
            </small>
          </div>
        )}
      </section>
      {data?.invitations.length ? (
        <section className="panel live-section live-help">
          <h2>Pending invitations</h2>
          {data.invitations.map((i) => (
            <p key={i.id}>
              {i.email} · expires {new Date(i.expires_at).toLocaleDateString()}
            </p>
          ))}
        </section>
      ) : null}
    </>
  );
}
function LiveSettings({
  org,
  email,
  notify,
  onError,
}: {
  org: Organization;
  email: string;
  notify: (s: string) => void;
  onError: (s: string) => void;
}) {
  const [name, setName] = useState(org.name),
    [confirm, setConfirm] = useState(""),
    [accountConfirm, setAccountConfirm] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <>
      <section className="panel live-help">
        <h2>Business settings</h2>
        <form
          className="form-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api(`orgs/${org.id}`, "PATCH", { name });
              notify(
                "Business name updated. Refresh the page to update navigation.",
              );
            } catch (e) {
              onError(errorMessage(e));
            }
          }}
        >
          <label>
            Business name
            <input
              required
              minLength={2}
              maxLength={160}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <p>
            {org.country_code} · Default language: {org.default_locale}
          </p>
          <button className="button primary">Save name</button>
        </form>
      </section>
      <section className="panel live-section live-help">
        <h2>Your data</h2>
        <p>
          Signed in as {email}. Exports contain locations, QR settings, members
          and aggregate analytics. Customer narratives are not retained.
        </p>
        <a
          className="button secondary"
          href={`/api/v1/orgs/${org.id}/export`}
          download
        >
          Download workspace export
        </a>
        <Link className="button secondary" href="/reset-password?request=1">
          Reset account password
        </Link>
        <Link className="button secondary" href="/admin">
          Authenticator & administration
        </Link>
      </section>
      <section className="panel live-section live-help">
        <h2>Schedule business deletion</h2>
        <p>
          This immediately disables public QR pages and access to the workspace.
          Operational data is removed after 30 days and provider cancellation.
          Payment records are retained for accounting. This does not delete your
          sign-in account.
        </p>
        <form
          className="form-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await api(`orgs/${org.id}`, "PATCH", {
                delete_requested: true,
                confirmation: confirm,
              });
              window.location.assign("/app");
            } catch (e) {
              onError(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Type DELETE to confirm
            <input
              required
              pattern="DELETE"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
          <button
            className="button secondary"
            disabled={busy || confirm !== "DELETE"}
          >
            Schedule business deletion
          </button>
        </form>
      </section>
      <section className="panel live-section live-help">
        <h2>Delete your sign-in account</h2>
        <p>
          Account deletion schedules all workspaces you administer for deletion,
          revokes your staff memberships and removes your sign-in identity after
          30 days and billing cancellation. Export your data first.
        </p>
        <form
          className="form-stack"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await api("auth/delete-account", "POST", {
                confirmation: accountConfirm,
              });
              window.location.assign("/login");
            } catch (e) {
              onError(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Type DELETE ACCOUNT
            <input
              required
              pattern="DELETE ACCOUNT"
              value={accountConfirm}
              onChange={(e) => setAccountConfirm(e.target.value)}
            />
          </label>
          <button
            className="button secondary"
            disabled={busy || accountConfirm !== "DELETE ACCOUNT"}
          >
            Schedule account deletion
          </button>
        </form>
      </section>
    </>
  );
}
