// Production additionally requires server-side DNS/redirect-chain validation.
export function validateReviewUrl(input: string): string {
  const u = new URL(input.trim());
  if (u.protocol !== 'https:' || u.username || u.password || u.port || u.hash) throw new Error('Use an official HTTPS Google review link without credentials, ports, or fragments.');
  const short = u.hostname === 'g.page' && /^\/r\/[A-Za-z0-9_-]+\/review\/?$/.test(u.pathname) && !u.search;
  const full = (u.hostname === 'search.google.com' || u.hostname === 'www.google.com') && u.pathname === '/local/writereview' && /^ChI[A-Za-z0-9_-]+$/.test(u.searchParams.get('placeid') || '') && Array.from(u.searchParams.keys()).every(k => k === 'placeid') && u.searchParams.getAll('placeid').length === 1;
  if (!short && !full) throw new Error('Use a g.page/r/…/review link or a Google /local/writereview?placeid=… link.');
  return u.href;
}
export function validateNarrative(text: string): string | null {
  const value = text.trim();
  if (value.length < 20) return 'Please describe your experience in at least 20 characters.';
  if (value.length > 1500) return 'Please keep your experience under 1,500 characters.';
  if (/^(?:[1-5]\s*(?:stars?|स्टार)\s*[.! ]*)+$/i.test(value) || new Set(value.replace(/\s/g,'')).size < 4) return 'Add a few details about your real experience, beyond a rating.';
  return null;
}
