export type NDEFWriter = {
  write(message: { records: { recordType: "url"; data: string }[] }, options: { signal: AbortSignal; overwrite: boolean }): Promise<void>;
};
export type NFCWindow = { NDEFReader?: new () => NDEFWriter; isSecureContext: boolean };

export function nfcReviewURL(origin: string, slug: string) {
  const base = new URL(origin);
  if (base.protocol !== "https:" || base.username || base.password || !/^[A-Za-z0-9_-]{24,64}$/.test(slug)) {
    throw new Error("NFC tags need a public HTTPS review link. Configure your secure application URL first.");
  }
  return `${base.origin}/r/${slug}`;
}
export async function writeReviewTag(host: NFCWindow, url: string, signal: AbortSignal, overwrite = false) {
  if (!host.isSecureContext || !host.NDEFReader) {
    throw new Error("Use Chrome on an NFC-enabled Android phone, or copy the link into an NFC writing app.");
  }
  const parsed = new URL(url);
  const slug = parsed.pathname.replace(/^\/r\//, "");
  if (nfcReviewURL(parsed.origin, slug) !== url) throw new Error("Invalid NFC review link.");
  await new host.NDEFReader().write({ records: [{ recordType: "url", data: url }] }, { signal, overwrite });
}
export function nfcError(error: unknown) {
  if (error instanceof Error) {
    if (error.name === "AbortError") return "Writing stopped. You can try again when your tag is ready.";
    if (error.name === "NotAllowedError") return "NFC permission was denied. Allow NFC access in your browser and try again.";
    if (error.name === "NotSupportedError") return "This tag is not writable or already contains data. Use a blank NDEF tag or explicitly allow replacement.";
    if (error.name === "NotReadableError") return "Could not reach the chip. Turn on NFC and hold the tag against your phone.";
    return error.message;
  }
  return "Could not write the chip. Check that NFC is enabled and the tag is writable.";
}
