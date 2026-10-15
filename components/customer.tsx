"use client";
import Link from "next/link";

import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Coffee,
  Globe,
  Leaf,
  ShieldCheck,
  Sparkles,
  Star,
  ExternalLink,
} from "lucide-react";
import Brand from "./brand";
import { InfoNote, Modal } from "./primitives";
import { loadState, recordEvent, type Location, type Code } from "@/lib/model";
import { validateNarrative, validateReviewUrl } from "@/lib/validation";
import { reviewSource, reviewOptions } from "@/lib/review-assistance";
import ReviewOptions from "./review-options";
const words = {
  en: {
    language: "English",
    share: "Every experience has a voice.",
    intro: "Tell it in your words. We’re here to help you find them.",
    direct: "Review directly on Google",
    assist: "Write with assistance",
    optional: "A little help with the words. Always your experience.",
    or: "OR TAKE THE DIRECT ROUTE",
    noLogin: "No sign-up. No pressure. Your choice.",
    tell: "How was your experience?",
    tellSub: "The little details tell the real story. What stood out to you?",
    label: "Your experience",
    placeholder:
      "What did you try? How was the service? What could have been better?",
    rating: "How did it feel?",
    optionalRating:
      "Choose stars to generate four review options. Adding details is optional.",
    next: "Review my words",
    back: "Back",
    edit: "Your experience. Your words.",
    editSub: "Take a moment to check your text. Make it sound like you.",
    draft: "Your editable review",
    copy: "Copy my words",
    copied: "Copied!",
    open: "Open Google review page",
    original: "Keep original",
    notice:
      "Demo mode: these options use the business profile, your rating and any details you added. AI is not connected. You can edit, copy, and continue.",
    privacy:
      "Your text is not saved by Reputly. You choose what to share on Google.",
    disclaimer:
      "Please check accuracy. You’ll decide whether to paste and publish on Google.",
    inactive: "This QR is taking a little break.",
    inactiveSub:
      "This location or QR code is paused. Please ask the business for its current review link.",
    missing: "We couldn’t find this QR.",
    missingSub:
      "Custom demo codes only work in the browser where they were created. Try the sample experience below.",
    demo: "CUSTOMER EXPERIENCE · DEMO",
    sampleTitle: "That’s the handoff.",
    sampleText:
      "On a connected location, this opens its official Google review page. This sample business has no real Google destination, so nothing has been posted.",
    sampleAction: "Back to my experience",
    errorMin: "Please describe your experience in at least 20 characters.",
    select:
      "Copy wasn’t available. Select your text below and copy it manually.",
    private: "A real experience is all you need.",
    notposted: "You’re in control. Reputly never posts for you.",
  },
  hi: {
    language: "हिन्दी",
    share: "हर अनुभव की अपनी आवाज़ है।",
    intro:
      "अपना अनुभव अपने शब्दों में बताएं। शब्दों को सँवारने में हम मदद करेंगे।",
    direct: "सीधे Google पर समीक्षा लिखें",
    assist: "लिखने में मदद लें",
    optional: "शब्दों में थोड़ी मदद। अनुभव हमेशा आपका।",
    or: "या सीधे GOOGLE पर जाएं",
    noLogin: "कोई साइन-अप नहीं। कोई दबाव नहीं। आपकी मर्ज़ी।",
    tell: "आपका अनुभव कैसा रहा?",
    tellSub: "छोटी बातें असली कहानी बताती हैं। आपको क्या खास लगा?",
    label: "आपका अनुभव",
    placeholder: "आपने क्या आज़माया? सेवा कैसी थी? क्या बेहतर हो सकता था?",
    rating: "आपको कैसा लगा?",
    optionalRating:
      "स्टार चुनते ही चार समीक्षा विकल्प तैयार होंगे। अपनी बातें जोड़ना वैकल्पिक है।",
    next: "मेरे शब्दों की समीक्षा करें",
    back: "वापस",
    edit: "आपका अनुभव। आपके शब्द।",
    editSub: "अपने शब्द जाँचें और ज़रूरत हो तो बदलें।",
    draft: "आपकी संपादन योग्य समीक्षा",
    copy: "मेरे शब्द कॉपी करें",
    copied: "कॉपी हो गया!",
    open: "Google समीक्षा पेज खोलें",
    original: "मूल शब्द रखें",
    notice:
      "डेमो मोड: ये विकल्प व्यवसाय, आपकी रेटिंग और जोड़ी गई बातों पर आधारित हैं। AI जुड़ा नहीं है। आप इन्हें बदलकर कॉपी कर सकते हैं।",
    privacy:
      "Reputly आपके शब्द सेव नहीं करता। Google पर क्या साझा करना है, यह आप तय करते हैं।",
    disclaimer:
      "कृपया सटीकता जाँचें। Google पर पेस्ट और प्रकाशित करना आपका निर्णय है।",
    inactive: "यह QR अभी उपलब्ध नहीं है।",
    inactiveSub:
      "यह स्थान या QR रुका हुआ है। व्यवसाय से वर्तमान समीक्षा लिंक माँगें।",
    missing: "यह QR नहीं मिला।",
    missingSub:
      "कस्टम डेमो कोड केवल उसी ब्राउज़र में काम करते हैं जहाँ वे बनाए गए थे। नीचे नमूना अनुभव आज़माएँ।",
    demo: "ग्राहक अनुभव · डेमो",
    sampleTitle: "अगला कदम Google है।",
    sampleText:
      "जुड़े हुए स्थान पर यह आधिकारिक Google समीक्षा पेज खोलता है। इस नमूना व्यवसाय का असली Google लिंक नहीं है। कुछ भी पोस्ट नहीं किया गया है।",
    sampleAction: "मेरे अनुभव पर वापस जाएँ",
    errorMin: "कृपया कम से कम 20 अक्षरों में अपना अनुभव बताएं।",
    select: "कॉपी उपलब्ध नहीं है। नीचे अपना टेक्स्ट चुनें और खुद कॉपी करें।",
    private: "बस आपका वास्तविक अनुभव चाहिए।",
    notposted: "नियंत्रण आपके पास है। Reputly आपके लिए पोस्ट नहीं करता।",
  },
};
export default function Customer({ slug }: { slug: string }) {
  const [locale, setLocale] = useState<"en" | "hi">("en");
  const t = words[locale];
  const [location, setLocation] = useState<Location | null>(null);
  const [code, setCode] = useState<Code | null>(null);
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState(0);
  const [source, setSource] = useState("");
  const [draft, setDraft] = useState("");
  const [drafts, setDrafts] = useState<string[]>([]);
  const [selected, setSelected] = useState(-1);
  const [rating, setRating] = useState(0);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [handoff, setHandoff] = useState(false);
  useEffect(() => {
    const s = loadState();
    const c = s.codes.find((c) => c.slug === slug);
    const l = s.locations.find((l) => l.id === c?.locationId);
    // Hydrate browser-only state after SSR; the server cannot read browser storage or URL tokens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCode(c || null);
    setLocation(l || null);
    setReady(true);
    if (navigator.language.startsWith("hi")) setLocale("hi");
    if (c?.active && l?.status === "active")
      recordEvent(l.id, c.id, "qr_opened");
  }, [slug]);
  function updateDraft(value: string) {
    setDraft(value);
    setCopied(false);
  }
  function event(
    type: "assist_started" | "copy_clicked" | "review_link_clicked",
  ) {
    if (location && code) recordEvent(location.id, code.id, type);
  }
  function google() {
    event("review_link_clicked");
    let url = "";
    try {
      if (location?.reviewUrl) url = validateReviewUrl(location.reviewUrl);
    } catch {
      /* Never open an unsafe destination. */
    }
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    else setHandoff(true);
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setError("");
      event("copy_clicked");
    } catch {
      setError(t.select);
      const editor = document.querySelector<HTMLTextAreaElement>(
        '[data-review-editor="true"], #review-draft',
      );
      editor?.focus();
      editor?.select();
    }
  }
  return (
    <div className="customer-page" lang={locale}>
      <header className="customer-header">
        <Brand />
        <label className="locale-selector">
          <Globe size={15} />
          <select
            aria-label="Language / भाषा"
            value={locale}
            onChange={(e) => {
              const nextLocale = e.target.value as "en" | "hi";
              setLocale(nextLocale);
              if (rating && !source.trim()) {
                setDrafts(
                  reviewOptions("", rating, nextLocale, location || undefined),
                );
                setSelected(-1);
                updateDraft("");
                if (step === 2) setStep(1);
              }
              setError("");
            }}
          >
            <option value="en">English</option>
            <option value="hi">हिन्दी</option>
          </select>
        </label>
      </header>
      <main className="customer-main">
        <div className="customer-demo-label">{t.demo}</div>
        {!ready ? (
          <div className="customer-card customer-loading">
            {locale === "en" ? "Getting things ready…" : "तैयारी हो रही है…"}
          </div>
        ) : !code ||
          !location ||
          !code.active ||
          location.status !== "active" ? (
          <section className="customer-card customer-status">
            <span className="customer-business-icon">
              <Coffee size={30} />
            </span>
            <h1>{!code || !location ? t.missing : t.inactive}</h1>
            <p>{!code || !location ? t.missingSub : t.inactiveSub}</p>
            <Link className="button secondary full" href="/r/daily-grind-demo-1">
              {locale === "en"
                ? "Try a sample experience"
                : "नमूना अनुभव आज़माएं"}
            </Link>
          </section>
        ) : (
          <section className="customer-card">
            <div className="customer-business">
              <span
                className="customer-business-icon"
                style={{
                  background: location.color + "16",
                  color: location.color,
                }}
              >
                <Coffee size={28} />
              </span>
              <strong>{location.name}</strong>
              <span>{location.area}</span>
            </div>
            {step === 0 ? (
              <>
                <div className="customer-hero-icon">
                  <Leaf size={20} />
                </div>
                <h1>{t.share}</h1>
                <p className="customer-subtitle">{t.intro}</p>
                <button
                  className="button primary full customer-button"
                  onClick={() => {
                    setStep(1);
                    event("assist_started");
                  }}
                >
                  <Sparkles size={18} />
                  {t.assist}
                  <ArrowRight size={17} />
                </button>
                <p className="customer-button-note">{t.optional}</p>
                <div className="or-divider">
                  <span />
                  {t.or}
                  <span />
                </div>
                <button
                  className="button secondary full customer-button google-button"
                  onClick={google}
                >
                  <span className="google-g">G</span>
                  {t.direct}
                  <ArrowUpRight size={17} />
                </button>
                <p className="customer-reassurance">
                  <ShieldCheck size={14} />
                  {t.noLogin}
                </p>
              </>
            ) : (
              <>
                <button
                  className="text-button customer-back"
                  onClick={() => {
                    setStep(step - 1);
                    setError("");
                  }}
                >
                  <ArrowLeft size={14} />
                  {t.back}
                </button>

                <h1 className="customer-step-heading">{t.tell}</h1>
                <p className="customer-subtitle">{t.tellSub}</p>
                <form
                  className="form-stack"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const validation = validateNarrative(source);
                    if (!rating && validation) {
                      setError(locale === "hi" ? t.errorMin : validation);
                      return;
                    }
                    if (rating && !source.trim() && selected < 0) {
                      setError(
                        locale === "hi"
                          ? "एक समीक्षा विकल्प चुनें।"
                          : "Choose a review option below.",
                      );
                      return;
                    }
                    const original = reviewSource(
                      source,
                      rating || undefined,
                      locale,
                    );
                    updateDraft(original);
                    setDrafts([original]);
                    setSelected(0);
                    setCopied(false);
                    setError("");
                  }}
                >
                  <fieldset className="rating-field">
                    <legend>{t.rating}</legend>
                    <div className="stars">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          aria-label={`${n} ${locale === "en" ? "star" : "स्टार"}`}
                          aria-pressed={rating === n}
                          onClick={() => {
                            setRating(n);
                            setDrafts(
                              reviewOptions(source, n, locale, location),
                            );
                            setSelected(-1);
                            updateDraft("");
                            setError("");
                          }}
                        >
                          <Star
                            size={28}
                            fill={rating >= n ? "#bb9045" : "none"}
                            stroke={rating >= n ? "#bb9045" : "#aeb2a6"}
                          />
                        </button>
                      ))}
                    </div>
                    <small>{t.optionalRating}</small>
                  </fieldset>
                  <details className="experience-details">
                    <summary>
                      {locale === "hi"
                        ? "अपनी बातें जोड़ें (वैकल्पिक)"
                        : "Add details (optional)"}
                    </summary>
                    <label>
                      {t.label}
                      <textarea
                        value={source}
                        maxLength={1500}
                        rows={3}
                        placeholder={t.placeholder}
                        onChange={(e) => {
                          setSource(e.target.value);
                          if (rating) {
                            setDrafts(
                              reviewOptions(
                                e.target.value,
                                rating,
                                locale,
                                location,
                              ),
                            );
                            setSelected(-1);
                            updateDraft("");
                          }
                          setError("");
                        }}
                      />
                    </label>
                    <div className="character-count">
                      {source.length} / 1,500
                    </div>
                  </details>

                  {drafts.length > 0 && <InfoNote>{t.notice}</InfoNote>}
                  {drafts.length > 0 && (
                    <ReviewOptions
                      drafts={drafts}
                      selected={selected}
                      locale={locale}
                      onSelect={(index) => {
                        setSelected(index);
                        updateDraft(drafts[index]);
                        setCopied(false);
                        setError("");
                      }}
                      onEdit={(value) => {
                        updateDraft(value);
                        setDrafts((current) =>
                          current.map((option, index) =>
                            index === selected ? value : option,
                          ),
                        );
                        setCopied(false);
                      }}
                      onCopy={() => void copy()}
                      copied={copied}
                    />
                  )}
                  {selected >= 0 && (
                    <p className="field-help">{t.disclaimer}</p>
                  )}
                  {error && (
                    <p className="form-error" role="alert">
                      {error}
                    </p>
                  )}
                  {selected < 0 && (!rating || Boolean(source.trim())) && (
                    <button
                      className="button primary full customer-button"
                      type="submit"
                    >
                      {t.next}
                      <ArrowRight size={17} />
                    </button>
                  )}
                </form>
                <div className="customer-direct">
                  <button
                    className="button secondary full customer-button google-button"
                    onClick={google}
                  >
                    <span className="google-g">G</span>
                    {selected >= 0 ? t.open : t.direct}
                    <ArrowUpRight size={17} />
                  </button>
                  <p>{t.notposted}</p>
                </div>
              </>
            )}
          </section>
        )}
        <div className="customer-privacy">
          <ShieldCheck size={15} />
          <p>{t.privacy}</p>
        </div>
      </main>
      <footer className="customer-footer">
        <span>{t.private}</span>
        <Link href="/privacy">{locale === "en" ? "Privacy" : "गोपनीयता"}</Link>
      </footer>
      {handoff && (
        <Modal title={t.sampleTitle} onClose={() => setHandoff(false)}>
          <div className="empty-state compact">
            <span className="feature-icon">
              <ExternalLink size={26} />
            </span>
            <p>{t.sampleText}</p>
          </div>
          <button
            className="button primary full"
            onClick={() => setHandoff(false)}
          >
            {t.sampleAction}
          </button>
        </Modal>
      )}
    </div>
  );
}
