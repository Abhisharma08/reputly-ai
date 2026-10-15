/** Express only the customer's overall rating; never invent visit details. */
export function ratingDraft(rating: number, locale: string = "en") {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5)
    throw new Error("Choose a rating from 1 to 5.");
  const english = [
    "disappointing",
    "below expectations",
    "average",
    "good",
    "excellent",
  ];
  const hindi = ["निराशाजनक", "उम्मीद से कम", "औसत", "अच्छा", "बहुत अच्छा"];
  return locale.startsWith("hi")
    ? `कुल मिलाकर मेरा अनुभव ${hindi[rating - 1]} रहा।`
    : `Overall, my experience was ${english[rating - 1]}.`;
}

/** Customer details take precedence over a rating's inferred overall tone. */
export const experienceTopics = [
  "service",
  "quality",
  "value",
  "selection",
  "delivery",
  "food",
  "atmosphere",
  "wait_time",
  "results",
  "convenience",
] as const;
export type ExperienceTopic = (typeof experienceTopics)[number];
export const topicLabels: Record<ExperienceTopic, [string, string]> = {
  service: ["Service", "सेवा"],
  quality: ["Quality", "गुणवत्ता"],
  value: ["Value", "कीमत के अनुसार अनुभव"],
  selection: ["Selection", "विकल्प"],
  delivery: ["Delivery", "डिलीवरी"],
  food: ["Food", "खाना"],
  atmosphere: ["Atmosphere", "माहौल"],
  wait_time: ["Waiting time", "इंतज़ार"],
  results: ["Results", "नतीजे"],
  convenience: ["Convenience", "सुविधा"],
};
export function topicsForCategory(category = ""): ExperienceTopic[] {
  if (/furniture|store|shop|retail/i.test(category))
    return ["selection", "quality", "service", "delivery", "value"];
  if (/café|cafe|restaurant|food|bakery|coffee/i.test(category))
    return ["food", "service", "atmosphere", "value", "wait_time"];
  if (/salon|spa|beauty/i.test(category))
    return ["results", "service", "atmosphere", "value"];
  return ["service", "quality", "value", "convenience"];
}
export function reviewSource(
  source: string,
  rating?: number,
  locale = "en",
  topics: ExperienceTopic[] = [],
) {
  const details = source.trim();
  const base = details || (rating ? ratingDraft(rating, locale) : "");
  if (!topics.length) return base;
  const labels = topics.map(
    (topic) => topicLabels[topic][locale.startsWith("hi") ? 1 : 0],
  );
  return `${base}\n${locale.startsWith("hi") ? "मेरी प्रतिक्रिया इन बातों के बारे में है" : "My feedback concerns"}: ${labels.join(", ")}.`;
}

/** Rating guides tone; suggestions never spell out a score. */
export function mentionsRatingScore(text: string, businessName = "") {
  return /(?:\b(?:[1-5]|one|two|three|four|five)\s*(?:out\s+of|\/|of)\s*(?:5|five)\b)|(?:\b(?:[1-5]|one|two|three|four|five)[\s-]*stars?\b)|(?:[५5]\s*में\s*से\s*[१-५1-5])|(?:[१-५1-5]\s*स्टार)|(?:(?:एक|दो|तीन|चार|पाँच|पांच)\s*स्टार)|(?:(?:पाँच|पांच)\s*में\s*से\s*(?:एक|दो|तीन|चार|पाँच|पांच))/i.test(
    businessName ? text.replaceAll(businessName, "") : text,
  );
}

export type BusinessProfile = { name: string; category?: string };

/** Local alternatives stay usable when the provider is unavailable. */
export function reviewOptions(
  source: string,
  rating?: number,
  locale = "en",
  business?: BusinessProfile,
  topics: ExperienceTopic[] = [],
) {
  const original = reviewSource(source, rating, locale, topics);
  const name = business?.name.trim();
  if (locale.startsWith("hi")) {
    const subject = name || "इस व्यवसाय";
    if (source.trim())
      return [
        original,
        `${subject} के लिए मेरा अनुभव:\n\n${original}`,
        `मेरी समीक्षा:\n\n${original}`,
        `${original}\n\nयह ${subject} के लिए मेरी प्रतिक्रिया है।`,
      ];
    ratingDraft(rating!, locale);
    const sentiment = [
      "निराशाजनक",
      "उम्मीद से कम",
      "औसत",
      "अच्छा",
      "बहुत अच्छा",
    ][rating! - 1];
    const options = [
      `${subject} के साथ मेरा कुल अनुभव ${sentiment} रहा।`,
      `${subject} के बारे में सोचने पर मेरा अनुभव ${sentiment} लगता है।`,
      `${subject}: मेरा अनुभव ${sentiment} रहा। अपनी प्रतिक्रिया साझा करना चाहता/चाहती हूँ।`,
      `मेरी उम्मीदों और अनुभव के आधार पर ${subject} को लेकर मेरी राय ${sentiment} है।`,
    ];
    return topics.length
      ? options.map((option) => `${option}\n${original.split("\n").pop()}`)
      : options;
  }
  const subject = name || "this business";
  if (source.trim())
    return [
      original,
      `My experience with ${subject}:\n\n${original}`,
      `My review:\n\n${original}`,
      `${original}\n\nThis is my feedback for ${subject}.`,
    ];
  ratingDraft(rating!, locale);
  const alternatives = [
    [
      `My experience with ${subject} was disappointing.`,
      `I hoped for more from ${subject}, but came away disappointed.`,
      `${subject} fell short of my expectations. I wanted to share my honest feedback.`,
      `Looking back on my experience with ${subject}, I feel let down.`,
    ],
    [
      `My experience with ${subject} could have been better.`,
      `${subject} did not quite meet my expectations. There is room for improvement.`,
      `I came away from ${subject} feeling underwhelmed.`,
      `I wanted more from my experience with ${subject}. It fell below what I had hoped for.`,
    ],
    [
      `My experience with ${subject} was average.`,
      `${subject} left me with a mixed overall impression.`,
      `For me, ${subject} was neither particularly good nor particularly disappointing.`,
      `Looking back, I would describe my experience with ${subject} as just okay.`,
    ],
    [
      `I had a good experience with ${subject}.`,
      `${subject} left me with a positive impression, even with some room to improve.`,
      `I'm happy with my experience at ${subject} overall.`,
      `Looking back on ${subject}, the overall experience was a positive one for me.`,
    ],
    [
      `I'm really happy with my experience at ${subject}.`,
      `${subject} met my expectations very well. I came away feeling pleased.`,
      `An excellent experience with ${subject}, and one I feel very positive about.`,
      `Thinking back on ${subject}, I'm glad I had such a good experience.`,
    ],
  ][rating! - 1];
  return topics.length
    ? alternatives.map((option) => `${option}\n${original.split("\n").pop()}`)
    : alternatives;
}
