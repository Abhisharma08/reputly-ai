"use client";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Copy, Check } from "lucide-react";
export default function ReviewOptions({
  drafts,
  selected,
  onSelect,
  locale,
  onEdit,
  onCopy,
  copied = false,
  disabled = false,
}: {
  drafts: string[];
  selected: number;
  onSelect: (index: number) => void;
  locale: "en" | "hi";
  onEdit?: (value: string) => void;
  onCopy?: () => void;
  copied?: boolean;
  disabled?: boolean;
}) {
  const name = useId();
  const track = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(0);
  const lastSelection = useRef(-1);
  const lastBatch = useRef(drafts);
  const hi = locale === "hi";
  function browse(index: number) {
    const viewport = track.current;
    const card = viewport?.children[index] as HTMLElement | undefined;
    if (!viewport || !card) return;
    viewport.scrollTo({
      left: card.offsetLeft,
      // Immediate arrow navigation prevents in-flight scroll events from
      // rolling back the selected page during repeated clicks.
      behavior: "instant",
    });
    setVisible(index);
  }
  useEffect(() => {
    if (
      selected !== lastSelection.current ||
      (selected < 0 && drafts !== lastBatch.current)
    )
      browse(selected >= 0 ? selected : 0);
    lastSelection.current = selected;
    lastBatch.current = drafts;
  }, [drafts, selected]);
  return (
    <fieldset className="review-options">
      <legend>
        {locale === "hi" ? "एक समीक्षा चुनें" : "Choose a review"}
      </legend>
      <p className="field-help">
        {locale === "hi"
          ? "विकल्प देखने के लिए स्वाइप करें या तीर दबाएं। अपने अनुभव से मेल खाने वाले शब्द चुनें।"
          : "Swipe or use the arrows to browse. Choose the wording that reflects your experience."}
      </p>
      <div
        ref={track}
        id={`${name}-carousel`}
        className="review-option-list"
        role="region"
        aria-roledescription="carousel"
        aria-label={hi ? "समीक्षा सुझाव" : "Review suggestions"}
        onScroll={() => {
          const viewport = track.current;
          if (!viewport) return;
          const width =
            (viewport.children[1] as HTMLElement | undefined)?.offsetLeft ||
            viewport.clientWidth;
          setVisible(
            Math.min(
              drafts.length - 1,
              Math.max(0, Math.round(viewport.scrollLeft / width)),
            ),
          );
        }}
      >
        {drafts.map((draft, index) => (
          <div
            key={index}
            className={`review-option ${selected === index ? "selected" : ""}`}
          >
            <label className="review-option-heading">
              <input
                type="radio"
                name={name}
                value={index}
                checked={selected === index}
                onChange={() => onSelect(index)}
                onClick={() => {
                  if (selected === index) onSelect(index);
                }}
                aria-label={
                  locale === "hi"
                    ? `विकल्प ${index + 1}`
                    : `Review option ${index + 1}`
                }
                aria-describedby={
                  selected === index && onEdit
                    ? undefined
                    : `${name}-option-${index}`
                }
              />
              <span>
                <strong>
                  {locale === "hi"
                    ? `विकल्प ${index + 1}`
                    : `Option ${index + 1}`}
                </strong>
                {!(selected === index && onEdit) && (
                  <span
                    className="review-option-text"
                    id={`${name}-option-${index}`}
                  >
                    {draft}
                  </span>
                )}
              </span>
            </label>
            {selected === index && onEdit && (
              <div className="review-inline-editor">
                <label htmlFor={`${name}-edit-${index}`} className="field-help">
                  {hi
                    ? "अपने शब्द बदलें और कॉपी करें"
                    : "Edit your words and copy"}
                </label>
                <textarea
                  id={`${name}-edit-${index}`}
                  data-review-editor="true"
                  aria-label={
                    hi ? "आपकी संपादन योग्य समीक्षा" : "Your editable review"
                  }
                  value={draft}
                  rows={4}
                  maxLength={1500}
                  onChange={(event) => onEdit(event.target.value)}
                />
                {onCopy && (
                  <button
                    type="button"
                    className="button primary full"
                    disabled={disabled || !draft.trim()}
                    onClick={onCopy}
                  >
                    {copied ? <Check size={17} /> : <Copy size={17} />}
                    {hi
                      ? copied
                        ? "कॉपी हो गया!"
                        : "मेरे शब्द कॉपी करें"
                      : copied
                        ? "Copied!"
                        : "Copy my words"}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="review-carousel-controls">
        <button
          type="button"
          className="review-carousel-arrow"
          disabled={visible === 0}
          onClick={() => browse(visible - 1)}
          aria-controls={`${name}-carousel`}
          aria-label={hi ? "पिछला सुझाव" : "Previous suggestion"}
        >
          <ChevronLeft size={18} />
        </button>
        <span role="status" aria-live="polite" aria-atomic="true">
          {hi
            ? `विकल्प ${visible + 1} / ${drafts.length}`
            : `Option ${visible + 1} of ${drafts.length}`}
        </span>
        <button
          type="button"
          className="review-carousel-arrow"
          disabled={visible === drafts.length - 1}
          onClick={() => browse(visible + 1)}
          aria-controls={`${name}-carousel`}
          aria-label={hi ? "अगला सुझाव" : "Next suggestion"}
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </fieldset>
  );
}
