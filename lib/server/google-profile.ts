import { z } from "zod";
import { ApiError } from "./config";
import { validateReviewUrl } from "@/lib/validation";
import type { GoogleBusinessProfile } from "@/lib/google-profile";

const text = z.object({ text: z.string().max(4000).optional() });
const placeSchema = z.object({
  id: z.string(),
  displayName: text,
  primaryTypeDisplayName: text.optional(),
  types: z.array(z.string()).max(100).optional(),
  formattedAddress: z.string().max(2000).optional(),
  websiteUri: z.string().max(2048).optional(),
  internationalPhoneNumber: z.string().max(100).optional(),
  editorialSummary: text.optional(),
  regularOpeningHours: z
    .object({
      weekdayDescriptions: z.array(z.string().max(500)).max(14).optional(),
    })
    .optional(),
  businessStatus: z.string().optional(),
  attributions: z
    .array(
      z.object({ provider: z.string(), providerUri: z.string().optional() }),
    )
    .max(100)
    .optional(),
  delivery: z.boolean().optional(),
  takeout: z.boolean().optional(),
  dineIn: z.boolean().optional(),
  outdoorSeating: z.boolean().optional(),
  servesVegetarianFood: z.boolean().optional(),
  servesCoffee: z.boolean().optional(),
  reservable: z.boolean().optional(),
});
export function websiteURL(value: string | undefined) {
  try {
    const url = new URL(value || "");
    return ["https:", "http:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : "";
  } catch {
    return "";
  }
}
/** Read current Google data on demand; never cache or write it to the database. */
export async function googleBusinessProfile(
  reviewURL: string,
  parentSignal?: AbortSignal,
): Promise<GoogleBusinessProfile | null> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return null;
  const url = new URL(validateReviewUrl(reviewURL));
  const id = url.searchParams.get("placeid");
  if (!id || !/^ChI[A-Za-z0-9_-]+$/.test(id))
    throw new ApiError(
      "GOOGLE_PROFILE_UNAVAILABLE",
      422,
      "Use the full Google review link for this business.",
    );
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (parentSignal?.aborted) abort();
  parentSignal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, 5000);
  try {
    const response = await fetch(
      `https://places.googleapis.com/v1/places/${encodeURIComponent(id)}?languageCode=en`,
      {
        headers: {
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask":
            "id,displayName,primaryTypeDisplayName,types,formattedAddress,websiteUri,internationalPhoneNumber,editorialSummary,regularOpeningHours,businessStatus,attributions,delivery,takeout,dineIn,outdoorSeating,servesVegetarianFood,servesCoffee,reservable",
        },
        signal: controller.signal,
        redirect: "error",
        cache: "no-store",
      },
    );
    if (!response.ok)
      throw new ApiError(
        "GOOGLE_PROFILE_UNAVAILABLE",
        503,
        "Google business lookup is unavailable. Check that the server key has Places API (New) enabled.",
      );
    const place = placeSchema.parse(await response.json());
    if (place.id !== id || !place.displayName.text)
      throw new Error("Unexpected place response");
    const offerings = [
      [place.delivery, "Delivery available"],
      [place.takeout, "Takeaway available"],
      [place.dineIn, "Dine-in available"],
      [place.outdoorSeating, "Outdoor seating"],
      [place.servesVegetarianFood, "Vegetarian options"],
      [place.servesCoffee, "Coffee"],
      [place.reservable, "Reservations available"],
    ]
      .filter(([available]) => available === true)
      .map(([, label]) => String(label));
    return {
      place_id: id,
      name: place.displayName.text,
      category: place.primaryTypeDisplayName?.text || "Business",
      address: place.formattedAddress || "",
      website: websiteURL(place.websiteUri),
      phone: place.internationalPhoneNumber || "",
      about: place.editorialSummary?.text || "",
      types: place.types || [],
      hours: place.regularOpeningHours?.weekdayDescriptions || [],
      offerings,
      maps_url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.displayName.text)}&query_place_id=${encodeURIComponent(id)}`,
      attributions: (place.attributions || []).map((a) => ({
        name: a.provider,
        url: websiteURL(a.providerUri),
      })),
    };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      "GOOGLE_PROFILE_UNAVAILABLE",
      503,
      "Google business details could not be loaded. Your saved business details are still available.",
    );
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener("abort", abort);
  }
}
