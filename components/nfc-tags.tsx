"use client";
import Link from "next/link";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, Copy, Download, Nfc, Plus, Search, ShieldCheck } from "lucide-react";
import type { LiveLocation, LiveQR } from "@/lib/contracts";
import { api, errorMessage } from "@/lib/client";
import { nfcError, nfcReviewURL, writeReviewTag, type NFCWindow } from "@/lib/nfc";
import { InfoNote, Modal, QR, downloadQR } from "./primitives";

type Props = { org: string; locations: LiveLocation[]; codes: LiveQR[]; origin: string; onSaved: () => void };
export default function NFCTags({ org, locations, codes, origin, onSaved }: Props) {
  const tags = codes.filter(q => q.channel === "nfc");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [editor, setEditor] = useState<LiveQR | "new" | null>(null);
  const [program, setProgram] = useState<LiveQR | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const eligible = locations.filter(l => l.status === "active");
  const visible = tags.filter(q => (status === "all" || q.is_active === (status === "active")) &&
    `${q.label} ${q.placement} ${locations.find(l => l.id === q.location_id)?.name}`.toLowerCase().includes(query.toLowerCase()));
  async function toggle(tag: LiveQR) {
    if (busy) return;
    setBusy(tag.id); setError("");
    try {
      await api(`orgs/${org}/qr/${tag.id}`, "PATCH", { is_active: !tag.is_active });
      onSaved();
    } catch (e) { setError(errorMessage(e)); }
    finally { setBusy(null); }
  }
  return <>
    <section className="nfc-intro panel">
      <div className="nfc-symbol"><Nfc size={32} aria-hidden="true" /></div>
      <div><span className="eyebrow">TAP. CONNECT. REVIEW.</span><h2>A small chip. A direct connection.</h2><p>Create a review link for every NFC card, sticker, or counter stand. Manage access here, even after the chip is written.</p></div>
      <button className="button primary" onClick={() => setEditor("new")} disabled={!eligible.length}><Plus size={17} />Add NFC tag</button>
    </section>
    <div className="nfc-summary" aria-label="NFC inventory">
      <span><strong>{tags.length}</strong> registered tags</span>
      <span><strong>{tags.filter(t => t.is_active && eligible.some(l => l.id === t.location_id)).length}</strong> accepting visitors</span>
      <span><ShieldCheck size={16} />Location permissions apply</span>
    </div>
    {!eligible.length && <InfoNote>Activate a location with a confirmed Google review destination to add a tag. <Link href="/app/locations">Manage locations</Link></InfoNote>}
    {error && <p role="alert" className="form-error">{error}</p>}
    {notice && <p role="status" className="info-note">{notice}</p>}
    <div className="list-toolbar nfc-toolbar">
      <label className="search-field"><Search size={17} aria-hidden="true" /><input aria-label="Search NFC tags" placeholder="Search tags, placements, or locations" value={query} onChange={e => setQuery(e.target.value)} /></label>
      <select aria-label="Filter NFC status" value={status} onChange={e => setStatus(e.target.value)}><option value="all">All statuses</option><option value="active">Enabled</option><option value="paused">Paused</option></select>
    </div>
    <div className="nfc-grid">
      {visible.map(tag => {
        const location = locations.find(l => l.id === tag.location_id);
        const active = tag.is_active && location?.status === "active";
        return <article className="panel nfc-card" key={tag.id}>
          <div className="nfc-card-heading"><Nfc size={24} aria-hidden="true" /><span className={`status ${active ? "" : "paused"}`}>{!tag.is_active ? "Paused" : active ? "Enabled" : "Location inactive"}</span></div>
          <h2>{tag.label}</h2><p>{location?.name || "Unavailable location"}</p><p className="nfc-placement">{tag.placement || "No placement specified"}</p>
          <div className="nfc-card-actions"><button className="button primary" disabled={!active} onClick={() => setProgram(tag)}><Nfc size={16} />Program chip</button><button className="button secondary" onClick={() => setEditor(tag)}>Edit tag</button></div>
          <div className="nfc-card-footer"><a className="text-link" href={`${origin}/r/${tag.slug}`} target="_blank" rel="noopener noreferrer">Preview page <ArrowUpRight size={15} /></a><button disabled={busy !== null} className="text-button" onClick={() => void toggle(tag)}>{busy === tag.id ? "Saving…" : tag.is_active ? "Pause tag" : "Enable tag"}</button></div>
        </article>;
      })}
    </div>
    {!visible.length && <section className="panel empty-state"><Nfc size={36} /><h2>{tags.length ? "No matching tags" : "Your next review starts with a tap"}</h2><p>{tags.length ? "Try another search or status filter." : "Add your first NFC tag, then write its link to a compatible chip."}</p></section>}
    <section className="nfc-guide panel"><h2>From counter to customer</h2><ol><li><strong>Register a tag</strong><span>Choose its location and give it a name your team recognizes.</span></li><li><strong>Write its review link</strong><span>Use a compatible Android browser or an NFC writing app.</span></li><li><strong>Test a real tap</strong><span>Open the chip with another phone before placing it with customers.</span></li></ol><InfoNote>Link opens appear in Analytics. Opening a copied link or fallback QR is also counted; it does not verify a physical NFC tap.</InfoNote></section>
    {editor && <TagEditor org={org} locations={eligible} tag={editor === "new" ? null : editor} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); setNotice("NFC tag saved."); onSaved(); }} />}
    {program && <ProgramTag tag={program} origin={origin} onClose={() => setProgram(null)} />}
  </>;
}
function TagEditor({ org, locations, tag, onClose, onSaved }: { org: string; locations: LiveLocation[]; tag: LiveQR | null; onClose: () => void; onSaved: () => void }) {
  const [label, setLabel] = useState(tag?.label || "");
  const [placement, setPlacement] = useState(tag?.placement || "");
  const [location, setLocation] = useState(tag?.location_id || locations[0]?.id || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [key] = useState(() => crypto.randomUUID());
  async function save(e: FormEvent) {
    e.preventDefault(); if (busy) return; setBusy(true); setError("");
    try {
      await api(`orgs/${org}/qr${tag ? `/${tag.id}` : ""}`, tag ? "PATCH" : "POST", { label, placement, ...(!tag ? { channel: "nfc", location_id: location, brand_color: "#315b43" } : {}) }, tag ? undefined : key);
      onSaved();
    } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  return <Modal title={tag ? "Edit NFC tag" : "Add NFC tag"} onClose={onClose}>
    <form className="form-stack" onSubmit={save}>
      {!tag && <label>Location<select value={location} required onChange={e => setLocation(e.target.value)}>{locations.map(l => <option value={l.id} key={l.id}>{l.name}</option>)}</select></label>}
      <label>Tag name<input autoFocus required minLength={2} maxLength={70} placeholder="Reception review stand" value={label} onChange={e => setLabel(e.target.value)} /></label>
      <label>Placement (optional)<input maxLength={100} placeholder="Ground floor · front desk" value={placement} onChange={e => setPlacement(e.target.value)} /></label>
      <InfoNote>Each chip gets a stable customer link. Updating the location’s review destination also updates this tag.</InfoNote>
      {error && <p role="alert" className="form-error">{error}</p>}
      <div className="form-actions"><button type="button" className="button secondary" onClick={onClose}>Cancel</button><button disabled={busy || !location} className="button primary">{busy ? "Saving…" : "Save NFC tag"}</button></div>
    </form>
  </Modal>;
}
function ProgramTag({ tag, origin, onClose }: { tag: LiveQR; origin: string; onClose: () => void }) {
  const controller = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const [writing, setWriting] = useState(false);
  const [overwrite, setOverwrite] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const supported = typeof window !== "undefined" && window.isSecureContext && "NDEFReader" in window && window.top === window;
  let url = "", urlError = "";
  try { url = nfcReviewURL(origin, tag.slug); } catch (e) { urlError = nfcError(e); }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  async function write() {
    if (controller.current) return;
    const abort = new AbortController(); controller.current = abort;
    const timeout = setTimeout(() => abort.abort(), 60000);
    setWriting(true); setError(""); setMessage("Hold a writable NFC tag against your phone. Waiting for the chip…");
    try {
      await writeReviewTag(window as unknown as NFCWindow, url, abort.signal, overwrite);
      if (mounted.current) setMessage("Link written successfully. Test a tap with another phone before placing the tag.");
    } catch (e) { if (mounted.current) { setError(nfcError(e)); setMessage(""); } }
    finally { clearTimeout(timeout); controller.current = null; if (mounted.current) setWriting(false); }
  }
  return <Modal title={`Program ${tag.label}`} onClose={onClose}>
    <div className="form-stack">
      {urlError ? <p className="form-error" role="alert">{urlError}</p> : <>
        <div className="nfc-program-preview"><QR value={url} size={150} /><p>Scan to preview the same review page.</p></div>
        <label>Chip destination<input value={url} readOnly onFocus={e => e.target.select()} /></label>
        <div className="nfc-card-actions"><button className="button secondary" onClick={async () => { try { await navigator.clipboard.writeText(url); setMessage("Review link copied."); setError(""); } catch { setError("Copy is unavailable. Select and copy the destination field above."); } }}><Copy size={15} />Copy link</button><button className="button secondary" onClick={async () => { try { await downloadQR(url, tag.label, "png"); setMessage("Fallback QR downloaded."); } catch { setError("Could not download the QR. Try again."); } }}><Download size={15} />Fallback QR</button></div>
        {supported ? <><label className="checkbox-label"><input type="checkbox" checked={overwrite} disabled={writing} onChange={e => setOverwrite(e.target.checked)} /><span>Replace existing content on the chip</span></label><button className="button primary full" disabled={writing} onClick={() => void write()}><Nfc size={17} />{writing ? "Waiting for chip…" : "Write to NFC chip"}</button>{writing && <button className="button secondary" onClick={() => controller.current?.abort()}>Cancel writing</button>}</> : <InfoNote>To write here, open this workspace in Chrome on an NFC-enabled Android phone over HTTPS. On other devices, copy this link into an NFC writing app as a URL record.</InfoNote>}
      </>}
      {message && <p role="status" className="info-note">{message}</p>}{error && <p role="alert" className="form-error">{error}</p>}
      <p className="field-help">Use a writable NDEF-compatible chip. Customers tap to open the review page; they do not need this workspace or a writing app.</p>
    </div>
  </Modal>;
}
