import { validateReviewUrl } from "@/lib/validation";
import { ApiError } from "./config";
export async function resolveReviewUrl(
  input: string,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  let current: string;
  try {
    current = validateReviewUrl(input);
  } catch {
    throw new ApiError(
      "INVALID_REVIEW_URL",
      422,
      "Enter an official Google review URL.",
      { google_review_url: "unsupported_destination" },
    );
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    for (let hop = 0; hop < 5; hop++) {
      const u = new URL(current);
      // Only Google-owned exact hosts and supported paths can ever be fetched.
      // No arbitrary hostname, port, credential, private IP, or open redirect endpoint.
      if (u.hostname !== "g.page") return current;
      const response = await fetcher(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": "Reputly-Link-Validator/1.0" },
        cache: "no-store",
      });
      await response.body?.cancel();
      if (![301, 302, 303, 307, 308].includes(response.status))
        throw new ApiError(
          "INVALID_REVIEW_URL",
          422,
          "This short Google link could not be resolved. Use its full Google review link.",
        );
      const target = response.headers.get("location");
      if (!target)
        throw new ApiError(
          "INVALID_REVIEW_URL",
          422,
          "The Google link has no valid destination.",
        );
      try {
        current = validateReviewUrl(new URL(target, current).href);
      } catch {
        throw new ApiError(
          "INVALID_REVIEW_URL",
          422,
          "The Google link redirects to an unsupported destination.",
          { google_review_url: "unsupported_redirect" },
        );
      }
    }
    throw new ApiError(
      "INVALID_REVIEW_URL",
      422,
      "This link redirects too many times. Use its full Google review link.",
    );
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      "REVIEW_LINK_UNAVAILABLE",
      503,
      "Google’s destination could not be checked. Please try again.",
    );
  } finally {
    clearTimeout(timer);
  }
}
