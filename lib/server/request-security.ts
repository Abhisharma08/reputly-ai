// Only trust headers overwritten by the configured ingress. The origin must not
// be publicly reachable around that ingress. Unconfigured hosts share a bucket.
export function rateLimitIdentity(request: Request, proxy = process.env.TRUSTED_PROXY) {
  const header = proxy === "cloudflare" ? "cf-connecting-ip" : proxy === "vercel" ? "x-forwarded-for" : null;
  if (!header) return "untrusted-ingress";
  const value = request.headers.get(header)?.trim();
  // Reject chains, ports, arbitrary strings, and unbounded attacker input.
  if (!value || value.length > 45 || !/^[a-fA-F0-9.:]+$/.test(value)) return "untrusted-ingress";
  if (value.includes(":")) {
    try { new URL(`http://[${value}]/`); return value.toLowerCase(); } catch { return "untrusted-ingress"; }
  }
  const parts = value.split(".");
  return parts.length === 4 && parts.every(p => /^\d{1,3}$/.test(p) && Number(p) <= 255)
    ? parts.map(Number).join(".") : "untrusted-ingress";
}
