export type Location = { id: string; name: string; area: string; category: string; color: string; status: 'active' | 'paused'; reviewUrl: string; createdAt: string };
export type Code = { id: string; locationId: string; slug: string; label: string; color: string; active: boolean };
export type EventName = 'qr_opened' | 'assist_started' | 'ai_draft_completed' | 'copy_clicked' | 'review_link_clicked';
export type LocalEvent = { id: string; locationId: string; codeId: string; type: EventName; at: string };
export type Member = { id: string; name: string; email: string; role: 'Owner' | 'Location manager'; locationIds: string[]; status: 'Active' | 'Pending' };
export type DemoState = { version: 1; organization: string; locations: Location[]; codes: Code[]; events: LocalEvent[]; members: Member[]; plan: string; downloaded: boolean };
export const STORAGE_KEY = 'reputly.demo.v1';
export const seedLocations: Location[] = [
  { id: 'loc-1', name: 'The Daily Grind', area: 'Indiranagar, Bengaluru', category: 'Café', color: '#3b7055', status: 'active', reviewUrl: '', createdAt: '2026-09-11' },
  { id: 'loc-2', name: 'The Daily Grind', area: 'Koramangala, Bengaluru', category: 'Café', color: '#aa8052', status: 'active', reviewUrl: '', createdAt: '2026-09-16' },
  { id: 'loc-3', name: 'The Daily Grind', area: 'HSR Layout, Bengaluru', category: 'Café', color: '#788392', status: 'active', reviewUrl: '', createdAt: '2026-09-23' },
];
export const initialState: DemoState = {
  version: 1, organization: 'The Daily Grind', locations: seedLocations,
  codes: seedLocations.map((l, i) => ({ id: `qr-${i+1}`, locationId: l.id, slug: `daily-grind-demo-${i+1}`, label: ['At the counter', 'Table talk', 'A little feedback'][i], color: l.color, active: true })),
  events: [], members: [{ id: 'owner', name: 'Alex Morgan', email: 'alex@example.com', role: 'Owner', locationIds: [], status: 'Active' }, { id: 'manager', name: 'Priya Sharma', email: 'priya@example.com', role: 'Location manager', locationIds: ['loc-1'], status: 'Active' }], plan: 'Growth', downloaded: false,
};
export function loadState(): DemoState {
  try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) { const s = JSON.parse(raw); if (s.version === 1 && Array.isArray(s.locations) && Array.isArray(s.codes) && Array.isArray(s.events) && Array.isArray(s.members)) return s; } } catch { /* Storage may be unavailable. */ }
  return structuredClone(initialState);
}
export function saveState(s: DemoState) { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); window.dispatchEvent(new Event('reputly:change')); }
export function recordEvent(locationId: string, codeId: string, type: EventName) {
  try { const state = loadState(); const now = Date.now();
    if (state.events.some(e => e.codeId === codeId && e.type === type && now - Date.parse(e.at) < 300_000)) return;
    state.events.push({ id: crypto.randomUUID(), locationId, codeId, type, at: new Date().toISOString() });
    state.events = state.events.slice(-2000); saveState(state);
  } catch { /* Analytics never blocks the customer. */ }
}
export type DailyRow = { date: string; scans: number; assisted: number; completed: number; copies: number; handoffs: number };
export function dailyRows(state: DemoState, locationId: string, from: string, to: string): DailyRow[] {
  const rows: DailyRow[] = []; const today = new Date(); today.setUTCHours(0,0,0,0);
  const selected = state.locations.filter(l => locationId === 'all' || l.id === locationId);
  for (let i = 0; i < 60; i++) {
    const d = new Date(today); d.setUTCDate(d.getUTCDate() - 59 + i); const date = d.toISOString().slice(0,10);
    if (date < from || date > to) continue;
    const row = { date, scans: 0, assisted: 0, completed: 0, copies: 0, handoffs: 0 };
    selected.forEach(l => {
      const index = seedLocations.findIndex(x => x.id === l.id);
      if (index < 0) return;
      const scans = Math.round((11 + Math.sin(i * .65 + index) * 5 + (i % 7 === 4 ? 7 : 0) + i * .17) * [1.3,.8,.5][index]);
      row.scans += scans; row.assisted += Math.round(scans * .62); row.completed += Math.round(scans * .52); row.copies += Math.round(scans * .43); row.handoffs += Math.round(scans * .37);
    });
    const map = { qr_opened: 'scans', assist_started: 'assisted', ai_draft_completed: 'completed', copy_clicked: 'copies', review_link_clicked: 'handoffs' } as const;
    state.events.filter(e => e.at.slice(0,10) === date && selected.some(l => l.id === e.locationId)).forEach(e => row[map[e.type]]++);
    rows.push(row);
  }
  return rows;
}
export function sumRows(rows: DailyRow[]) { return rows.reduce((a,r) => ({ scans:a.scans+r.scans, assisted:a.assisted+r.assisted, completed:a.completed+r.completed, copies:a.copies+r.copies, handoffs:a.handoffs+r.handoffs }), { scans:0, assisted:0, completed:0, copies:0, handoffs:0 }); }
export function rangeDates(days: number) { const end = new Date(); const start = new Date(); start.setUTCDate(start.getUTCDate()-days+1); return { from: start.toISOString().slice(0,10), to: end.toISOString().slice(0,10) }; }
export function downloadFile(content: BlobPart, name: string, type: string) { const url = URL.createObjectURL(new Blob([content], { type })); const a = document.createElement('a'); a.href=url; a.download=name; a.click(); setTimeout(() => URL.revokeObjectURL(url),1000); }
export function csvCell(value: unknown) { const str = String(value ?? ''); return '"' + (/^[=+\-@\t\r]/.test(str) ? "'" : '') + str.replaceAll('"','""') + '"'; }
