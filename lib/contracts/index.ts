import { z } from "zod";
import { experienceTopics } from "@/lib/review-assistance";
export const uuid = z.string().uuid();
export const locale = z.enum(["en", "hi", "en-IN", "hi-IN"]);
export const orgSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    country_code: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .default("IN"),
    default_locale: locale.default("en"),
    terms_accepted: z.literal(true),
  })
  .strict();
const timezone = z.string().refine((v) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: v });
    return true;
  } catch {
    return false;
  }
}, "Use an IANA timezone");
export const locationSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    category: z.string().trim().min(2).max(50),
    country_code: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .default("IN"),
    locale: locale.default("en"),
    timezone: timezone.default("Asia/Kolkata"),
    address: z.string().trim().max(300).default(""),
    brand_color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default("#315b43"),
    google_review_url: z.string().max(2048).default(""),
    status: z.enum(["draft", "active", "archived"]).default("draft"),
    destination_confirmed: z.boolean().default(false),
  })
  .strict();
export const locationPatch = locationSchema.partial().strict();
export const qrSchema = z
  .object({
    location_id: uuid,
    channel: z.enum(["qr", "nfc"]).default("qr"),
    placement: z.string().trim().max(100).default(""),
    label: z.string().trim().min(2).max(70).default("Share your experience"),
    brand_color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default("#315b43"),
  })
  .strict();
export const qrPatch = z
  .object({
    placement: z.string().trim().max(100).optional(),
    label: z.string().trim().min(2).max(70).optional(),
    brand_color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    is_active: z.boolean().optional(),
  })
  .strict();
export const eventNames = [
  "qr_opened",
  "assist_started",
  "ai_draft_completed",
  "copy_clicked",
  "review_link_clicked",
] as const;
export const publicEventSchema = z
  .object({
    session_token: z.string().min(32).max(256),
    event_type: z.enum([
      "qr_opened",
      "assist_started",
      "copy_clicked",
      "review_link_clicked",
    ]),
    event_id: uuid,
  })
  .strict();
export const rewriteSchema = z
  .object({
    session_token: z.string().min(32).max(256),
    source_text: z.string().trim().max(1500).default(""),
    locale: locale,
    optional_rating: z.number().int().min(1).max(5).optional(),
    experience_topics: z
      .array(z.enum(experienceTopics))
      .max(5)
      .refine((items) => new Set(items).size === items.length)
      .default([]),
    previous_drafts: z.array(z.string().max(1500)).max(4).default([]),
  })
  .strict()
  .refine(
    (body) => Boolean(body.optional_rating) || body.source_text.length >= 20,
    {
      message:
        "Choose a star rating or describe your experience in at least 20 characters.",
      path: ["source_text"],
    },
  );
export const inviteSchema = z
  .object({
    email: z
      .string()
      .email()
      .max(254)
      .transform((x) => x.toLowerCase()),
    location_ids: z.array(uuid).min(1).max(100),
  })
  .strict();
export const loginSchema = z
  .object({
    email: z.string().email().max(254),
    password: z.string().min(1).max(128),
  })
  .strict();
export const signupSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    email: z.string().email().max(254),
    password: z.string().min(12).max(128),
    terms_accepted: z.literal(true),
  })
  .strict();
export const checkoutSchema = z
  .object({
    plan_code: z.enum(["starter-inr", "growth-inr", "business-inr"]),
    customer_phone: z.string().regex(/^[6-9][0-9]{9}$/),
    customer_name: z.string().trim().min(2).max(100),
  })
  .strict();
export type Organization = {
  id: string;
  name: string;
  country_code: string;
  default_locale: string;
  status: "active" | "suspended" | "deleting";
  created_at: string;
};
export type LiveLocation = {
  id: string;
  organization_id: string;
  name: string;
  category: string;
  country_code: string;
  locale: string;
  timezone: string;
  address: string;
  brand_color: string;
  google_review_url: string | null;
  status: "draft" | "active" | "archived";
  created_at: string;
};
export type LiveQR = {
  id: string;
  organization_id: string;
  location_id: string;
  slug: string;
  channel: "qr" | "nfc";
  placement: string;
  label: string;
  brand_color: string;
  is_active: boolean;
  created_at: string;
};
export type Plan = {
  id: string;
  code: string;
  name: string;
  currency: string;
  amount_minor: number;
  location_limit: number;
  ai_monthly_limit: number;
  billing_period: string;
};
export type Membership = {
  organization_id: string;
  user_id: string;
  role: "organization_admin" | "location_manager";
  accepted_at: string;
  organizations?: Organization;
};
export type LiveBilling = {
  status: string;
  plan_id: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  grace_until: string | null;
  provider_subscription_id: string | null;
  cancel_requested_at: string | null;
  plans: Plan;
};
