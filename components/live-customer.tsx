"use client";
import Link from "next/link";

import { useEffect, useRef, useState } from "react";
import { Sparkles, ArrowUpRight, ShieldCheck, Star, Globe } from "lucide-react";
import Brand from "./brand";
import { api, ClientError } from "@/lib/client";
import { validateNarrative } from "@/lib/validation";
import {
  reviewOptions,
  topicsForCategory,
  topicLabels,
  type ExperienceTopic,
} from "@/lib/review-assistance";
import ReviewOptions from "./review-options";
type PublicQR = {
  label: string;
  brand_color: string;
  location: { name: string; category: string; locale: string };
  ai_enabled: boolean;
};
const text = {
  en: {
    title: "Every experience has a voice.",
    intro:
      "Your experience. Your words. Share as much or as little as you like.",
    direct: "Review directly on Google",
    assist: "Write with assistance",
    label: "Add details about your experience (optional)",
    placeholder: "What did you try? How was the service? What could be better?",
    rating: "How was your experience?",
    ratingHelp:
      "Choose stars to generate four review options automatically. Google is available for every rating.",
    generate: "Update review options",
    working: "Thinking about your words…",
    draft: "Your editable review",
    regenerate: "Generate new options",
    original: "Keep my original",
    copy: "Copy my words",
    copied: "Copied!",
    copyError: "Select the text below and copy it manually.",
    privacy:
      "Reputly does not save your review text. Using assistance sends your text to our AI provider to edit it.",
    check:
      "Please check accuracy and edit this to reflect your experience. You choose whether to paste and publish on Google.",
    fallback:
      "AI assistance is unavailable. Choose a starter option to edit or copy.",
    starter:
      "These starter options reflect your rating and business profile. Choose one and make it your own.",
    short: "Choose stars or describe your experience in 20–1,500 characters.",
    inactive: "This QR is currently unavailable.",
    inactiveDetail:
      "Please ask the business for its current Google review link.",
    loading: "Opening the customer experience…",
    back: "Back to choices",
    attempts: "Up to three attempts per session.",
    limit:
      "The generation limit has been reached. You can still choose, edit and copy a review.",
    retry:
      "Please wait a minute before generating again. Your review options are still available.",
    unchanged:
      "The suggestions could not be verified. Choose a starter option and check it against your experience.",
    noLogin: "No sign-up. No pressure. Your choice.",
  },
  hi: {
    title: "हर अनुभव की अपनी आवाज़ है।",
    intro: "आपका अनुभव। आपके शब्द। जितना चाहें उतना साझा करें।",
    direct: "सीधे Google पर समीक्षा लिखें",
    assist: "लिखने में मदद लें",
    label: "अपने अनुभव की बातें जोड़ें (वैकल्पिक)",
    placeholder: "आपने क्या आज़माया? सेवा कैसी थी? क्या बेहतर हो सकता था?",
    rating: "आपका अनुभव कैसा रहा?",
    ratingHelp:
      "स्टार चुनते ही चार समीक्षा विकल्प तैयार होंगे। हर रेटिंग पर Google उपलब्ध है।",
    generate: "समीक्षा विकल्प अपडेट करें",
    working: "आपके शब्दों पर विचार कर रहे हैं…",
    draft: "आपकी संपादन योग्य समीक्षा",
    regenerate: "नए विकल्प तैयार करें",
    original: "मेरे मूल शब्द रखें",
    copy: "मेरे शब्द कॉपी करें",
    copied: "कॉपी हो गया!",
    copyError: "नीचे दिए शब्द चुनकर खुद कॉपी करें।",
    privacy:
      "Reputly आपकी समीक्षा के शब्द सहेजता नहीं है। लिखने की मदद लेने पर आपके शब्द संपादन के लिए हमारे AI प्रदाता को भेजे जाते हैं।",
    check:
      "शब्दों की सटीकता जाँचें और अपने अनुभव के अनुसार बदलें। Google पर पेस्ट करना और प्रकाशित करना आपकी मर्ज़ी है।",
    fallback:
      "AI मदद उपलब्ध नहीं है। बदलने या कॉपी करने के लिए एक शुरुआती विकल्प चुनें।",
    starter:
      "ये शुरुआती विकल्प आपकी रेटिंग और व्यवसाय पर आधारित हैं। एक चुनें और अपने अनुसार बदलें।",
    short: "स्टार चुनें या अपना अनुभव 20–1,500 अक्षरों में बताएं।",
    inactive: "यह QR अभी उपलब्ध नहीं है।",
    inactiveDetail: "कृपया व्यवसाय से उसका वर्तमान Google समीक्षा लिंक माँगें।",
    loading: "आपके अनुभव का पेज खुल रहा है…",
    back: "विकल्पों पर लौटें",
    attempts: "हर सत्र में अधिकतम तीन प्रयास।",
    limit:
      "नए सुझाव बनाने की सीमा पूरी हो गई है। आप विकल्प चुनकर बदल सकते हैं और कॉपी कर सकते हैं।",
    retry:
      "नए सुझाव बनाने से पहले एक मिनट रुकें। आपके विकल्प अभी भी उपलब्ध हैं।",
    unchanged:
      "सुझावों की पुष्टि नहीं हुई। एक शुरुआती विकल्प चुनें और अपने अनुभव से मिलाकर जाँचें।",
    noLogin: "कोई साइन-अप नहीं। कोई दबाव नहीं। आपकी मर्ज़ी।",
  },
};
export default function LiveCustomer({ slug }: { slug: string }) {
  const [qr, setQR] = useState<PublicQR | null>(null),
    [locale, setLocale] = useState<"en" | "hi">("en"),
    [failed, setFailed] = useState(false),
    [step, setStep] = useState(0),
    [source, setSource] = useState(""),
    [draft, setDraft] = useState(""),
    [drafts, setDrafts] = useState<string[]>([]),
    [selected, setSelected] = useState(-1),
    [rating, setRating] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [copied, setCopied] = useState(false),
    [attempts, setAttempts] = useState(0);
  const [topics, setTopics] = useState<ExperienceTopic[]>([]);
  const [googleContext, setGoogleContext] = useState(false);
  const [googleAttributions, setGoogleAttributions] = useState<
    { name: string; url: string }[]
  >([]);
  const token = useRef("");
  const init = useRef<Promise<string> | null>(null);
  const revision = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sent = useRef(0);
  const t = text[locale];
  function cancelGeneration() {
    if (pending.current) clearTimeout(pending.current);
    pending.current = null;
    setBusy(false);
    return ++revision.current;
  }
  useEffect(
    () => () => {
      revision.current++;
      if (pending.current) clearTimeout(pending.current);
    },
    [],
  );
  function ensureSession() {
    if (token.current) return Promise.resolve(token.current);
    if (init.current) return init.current;
    init.current = (async () => {
      const key = `reputly.public.${slug}`;
      try {
        const stored = JSON.parse(sessionStorage.getItem(key) || "null");
        if (
          stored?.expires_at > Date.now() &&
          typeof stored.token === "string"
        ) {
          token.current = stored.token;
          return stored.token;
        }
      } catch {}
      const s = await api<{ session_token: string; expires_at: string }>(
        `public/qr/${slug}/session`,
        "POST",
        {},
      );
      token.current = s.session_token;
      try {
        sessionStorage.setItem(
          key,
          JSON.stringify({
            token: s.session_token,
            expires_at: Date.parse(s.expires_at),
          }),
        );
      } catch {}
      return s.session_token;
    })().finally(() => {
      init.current = null;
    });
    return init.current;
  }
  async function event(
    event_type:
      "qr_opened" | "assist_started" | "copy_clicked" | "review_link_clicked",
  ) {
    try {
      const session_token = await ensureSession();
      await api("public/events", "POST", {
        session_token,
        event_type,
        event_id: crypto.randomUUID(),
      });
    } catch {
      /* Analytics must never block the customer's review choice. */
    }
  }
  useEffect(() => {
    let live = true;
    api<PublicQR>(`public/qr/${slug}`)
      .then((q) => {
        if (live) {
          setQR(q);
          setLocale(q.location.locale.startsWith("hi") ? "hi" : "en");
          void event("qr_opened");
        }
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
    };
  }, [slug]);
  function chooseRating(
    nextRating: number,
    nextLocale = locale,
    nextTopics = topics,
  ) {
    const version = cancelGeneration();
    setRating(nextRating);
    setCopied(false);
    setError("");
    showOptions(
      reviewOptions(source, nextRating, nextLocale, qr?.location, nextTopics),
    );
    setNotice(
      sent.current >= 3 ? text[nextLocale].limit : text[nextLocale].starter,
    );
    if (qr?.ai_enabled && sent.current < 3) {
      setBusy(true);
      pending.current = setTimeout(() => {
        pending.current = null;
        void generate(nextRating, nextLocale, version, nextTopics);
      }, 600);
    }
  }
  function showOptions(options: string[]) {
    setGoogleContext(false);
    setGoogleAttributions([]);
    setDrafts(options);
    setSelected(-1);
    setDraft("");
  }
  function selectDraft(index: number) {
    cancelGeneration();
    setSelected(index);
    setDraft(drafts[index]);
    setCopied(false);
    setError("");
  }
  function editDraft(value: string) {
    cancelGeneration();
    setDraft(value);
    setDrafts((current) =>
      current.map((option, index) => (index === selected ? value : option)),
    );
    setCopied(false);
  }
  async function generate(
    nextRating = rating,
    nextLocale = locale,
    expectedVersion?: number,
    nextTopics = topics,
  ) {
    const version = expectedVersion ?? cancelGeneration();
    if (version !== revision.current) return;
    const words = text[nextLocale];
    if (!nextRating && validateNarrative(source)) {
      setError(words.short);
      return;
    }
    setError("");
    setCopied(false);
    showOptions(
      reviewOptions(
        source,
        nextRating || undefined,
        nextLocale,
        qr?.location,
        nextTopics,
      ),
    );
    if (!qr?.ai_enabled || sent.current >= 3) {
      setNotice(sent.current >= 3 ? words.limit : words.starter);
      setBusy(false);
      return;
    }
    setBusy(true);
    try {
      const session_token = await ensureSession();
      if (version !== revision.current) return;
      if (sent.current >= 3) {
        setNotice(words.limit);
        return;
      }
      sent.current++;
      setAttempts(sent.current);
      const data = await api<{
        draft: string;
        drafts?: string[];
        unchanged: boolean;
        business_context?: "google" | "saved";
        google_attributions?: { name: string; url: string }[];
      }>("public/assist/rewrite", "POST", {
        session_token,
        source_text: source,
        locale: nextLocale,
        experience_topics: nextTopics,
        previous_drafts: drafts.slice(0, 4),
        ...(nextRating ? { optional_rating: nextRating } : {}),
      });
      if (version !== revision.current) return;
      showOptions(data.drafts || [data.draft]);
      setGoogleContext(data.business_context === "google");
      setGoogleAttributions(data.google_attributions || []);
      setNotice(data.unchanged ? words.unchanged : words.check);
    } catch (e) {
      if (version !== revision.current) return;
      setNotice(
        e instanceof ClientError && e.code === "AI_QUOTA_EXCEEDED"
          ? words.limit
          : e instanceof ClientError && e.code === "RATE_LIMITED"
            ? words.retry
            : words.fallback,
      );
      if (
        e instanceof ClientError &&
        [
          "AI_INPUT_TOO_SHORT",
          "AI_INPUT_UNSUPPORTED",
          "AI_SENSITIVE_DETAIL",
          "VALIDATION_ERROR",
        ].includes(e.code)
      )
        setError(e.message);
      if (e instanceof ClientError && e.code === "SESSION_EXPIRED") {
        token.current = "";
        try {
          sessionStorage.removeItem(`reputly.public.${slug}`);
        } catch {}
      }
    } finally {
      if (version === revision.current) setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setError("");
      void event("copy_clicked");
    } catch {
      setError(t.copyError);
      const el = document.querySelector<HTMLTextAreaElement>(
        '[data-review-editor="true"]',
      );
      el?.focus();
      el?.select();
    }
  }
  const google = (
    <a
      className="button secondary full customer-button google-button"
      href={`/api/v1/public/qr/${slug}/review-link?redirect=1`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => void event("review_link_clicked")}
    >
      <span className="google-g">G</span>
      {t.direct}
      <ArrowUpRight size={17} />
    </a>
  );
  return (
    <div className="customer-page" lang={locale}>
      <header className="customer-header">
        <Brand />
        <button
          className="language-button"
          onClick={() => {
            const nextLocale = locale === "en" ? "hi" : "en";
            cancelGeneration();
            setLocale(nextLocale);
            if (rating) chooseRating(rating, nextLocale);
          }}
        >
          <Globe size={15} />
          {locale === "en" ? "हिन्दी" : "English"}
        </button>
      </header>
      <main className="customer-main">
        {!qr ? (
          <section className="customer-card">
            <h1>{failed ? t.inactive : t.loading}</h1>
            {failed && <p>{t.inactiveDetail}</p>}
          </section>
        ) : (
          <section
            className="customer-card"
            style={{ borderTopColor: qr.brand_color }}
          >
            <div className="customer-business">
              <span className="eyebrow">{qr.location.category}</span>
              <h2>{qr.location.name}</h2>
            </div>
            {step === 0 ? (
              <>
                <h1 className="customer-step-heading">{t.title}</h1>
                <p className="customer-subtitle">{t.intro}</p>
                <button
                  className="button primary full customer-button"
                  onClick={() => {
                    setStep(1);
                    void event("assist_started");
                  }}
                >
                  <Sparkles size={18} />
                  {t.assist}
                </button>
                {google}
                <p className="field-help">{t.noLogin}</p>
              </>
            ) : (
              <>
                <button
                  className="text-button"
                  onClick={() => {
                    cancelGeneration();
                    setStep(0);
                    setError("");
                  }}
                >
                  {t.back}
                </button>
                <>
                  <form
                    className="form-stack"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void generate();
                    }}
                  >
                    <h1 className="customer-step-heading">{t.rating}</h1>
                    <fieldset className="rating-field">
                      <legend className="sr-only">{t.rating}</legend>
                      <div className="stars">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button
                            type="button"
                            key={n}
                            aria-pressed={rating === n}
                            aria-label={`${n} ${locale === "en" ? "stars" : "स्टार"}`}
                            onClick={() => chooseRating(n)}
                          >
                            <Star
                              fill={rating >= n ? "#bb9045" : "none"}
                              size={27}
                            />
                          </button>
                        ))}
                      </div>
                      <small>{t.ratingHelp}</small>
                    </fieldset>
                    <fieldset className="experience-highlights">
                      <legend>
                        {locale === "hi"
                          ? "क्या खास लगा? (वैकल्पिक)"
                          : "What stood out? (optional)"}
                      </legend>
                      <div className="highlight-list">
                        {topicsForCategory(qr.location.category).map(
                          (topic) => (
                            <button
                              key={topic}
                              type="button"
                              aria-pressed={topics.includes(topic)}
                              onClick={() => {
                                const next = topics.includes(topic)
                                  ? topics.filter((value) => value !== topic)
                                  : [...topics, topic].slice(0, 5);
                                setTopics(next);
                                if (rating) chooseRating(rating, locale, next);
                              }}
                            >
                              {topicLabels[topic][locale === "hi" ? 1 : 0]}
                            </button>
                          ),
                        )}
                      </div>
                    </fieldset>
                    <details className="experience-details">
                      <summary>{t.label}</summary>
                      <label>
                        {t.label}
                        <textarea
                          maxLength={1500}
                          rows={3}
                          value={source}
                          placeholder={t.placeholder}
                          onChange={(e) => {
                            cancelGeneration();
                            setSource(e.target.value);
                            setError("");
                          }}
                        />
                      </label>
                      <div className="character-count">
                        {source.length} / 1,500
                      </div>
                      <button className="button secondary full" disabled={busy}>
                        {t.generate}
                      </button>
                    </details>
                  </form>
                  {drafts.length > 0 && (
                    <>
                      <p role="status" className="info-note">
                        {busy ? t.working : notice || t.check}
                      </p>
                      <ReviewOptions
                        drafts={drafts}
                        selected={selected}
                        locale={locale}
                        onSelect={selectDraft}
                        onEdit={editDraft}
                        onCopy={() => void copy()}
                        copied={copied}
                        disabled={busy}
                      />
                      {googleContext && (
                        <p className="google-attribution">
                          {locale === "hi"
                            ? "व्यवसाय की जानकारी: "
                            : "Business information: "}
                          <span>Google Maps</span>
                          {googleAttributions.map((item, index) =>
                            item.url ? (
                              <a
                                key={index}
                                href={item.url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {" "}
                                · {item.name}
                              </a>
                            ) : (
                              <span key={index}> · {item.name}</span>
                            ),
                          )}
                        </p>
                      )}
                      {selected >= 0 && <p className="field-help">{t.check}</p>}
                      <button
                        className="button secondary full"
                        disabled={busy || attempts >= 3}
                        onClick={() => void generate()}
                      >
                        {t.regenerate}
                      </button>
                      <small>{t.attempts}</small>
                    </>
                  )}
                </>
                {error && (
                  <p role="alert" className="form-error">
                    {error}
                  </p>
                )}
                <div className="customer-direct">{google}</div>
              </>
            )}
          </section>
        )}
        <div className="customer-privacy">
          <ShieldCheck size={16} />
          <p>{t.privacy}</p>
        </div>
      </main>
      <footer className="customer-footer">
        <Link href="/privacy">{locale === "en" ? "Privacy" : "गोपनीयता"}</Link>
      </footer>
    </div>
  );
}
