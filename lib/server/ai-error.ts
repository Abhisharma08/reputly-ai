import { ApiError } from "./config";

export type AIReason =
  | "invalid_key"
  | "access_denied"
  | "billing_required"
  | "model_unavailable"
  | "rate_limited"
  | "request_rejected"
  | "provider_unavailable"
  | "network_error"
  | "timeout"
  | "blocked_response"
  | "truncated_response"
  | "invalid_response"
  | "invalid_review_options";
export type AIRejection =
  | "expired_key"
  | "blocked_key"
  | "service_disabled"
  | "unsupported_region"
  | "unsupported_field"
  | "invalid_schema"
  | "unsupported_thinking"
  | "invalid_argument";

/** Fixed diagnostic categories only; never retain provider bodies or prompts. */
export class AIProviderError extends ApiError {
  public stage?: "generation" | "verification" | "finalization";
  public networkCode?: string;
  public networkDetail?: ReturnType<typeof networkErrorDetail>;
  public rejection?: AIRejection;
  public rejectedField?: string;
  constructor(
    public provider: "gemini" | "openai",
    public reason: AIReason,
    public httpStatus?: number,
  ) {
    super(
      "AI_UNAVAILABLE",
      503,
      "AI assistance is unavailable. Choose a starter option to edit or copy.",
    );
  }
}

const networkCodes = new Set([
  "ENOTFOUND",
  "EAI_AGAIN",
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENETUNREACH",
  "EHOSTUNREACH",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
  "CERT_HAS_EXPIRED",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
]);
export function networkErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return;
  const current = error as {
    code?: unknown;
    cause?: unknown;
    errors?: unknown[];
  };
  if (typeof current.code === "string" && networkCodes.has(current.code))
    return current.code;
  const cause = current.cause as
    { code?: unknown; errors?: unknown[] } | undefined;
  if (typeof cause?.code === "string" && networkCodes.has(cause.code))
    return cause.code;
  for (const nested of [
    ...(Array.isArray(current.errors) ? current.errors : []),
    ...(Array.isArray(cause?.errors) ? cause.errors : []),
  ]) {
    if (
      nested &&
      typeof nested === "object" &&
      "code" in nested &&
      typeof nested.code === "string" &&
      networkCodes.has(nested.code)
    )
      return nested.code;
  }
}

/** Workerd errors often have no Node error code. Never return raw messages. */
export function networkErrorDetail(error: unknown) {
  const messages: string[] = [];
  if (error && typeof error === "object") {
    const current = error as { message?: unknown; cause?: unknown };
    if (typeof current.message === "string") messages.push(current.message);
    if (current.cause && typeof current.cause === "object") {
      const cause = current.cause as { message?: unknown };
      if (typeof cause.message === "string") messages.push(cause.message);
    }
  }
  const message = messages.join("\n");
  if (/different request|outside.{0,30}(?:request|handler)|I\/O.{0,30}(?:context|request)/i.test(message))
    return "request_context" as const;
  if (/certificate|TLS|SSL/i.test(message)) return "tls_failure" as const;
  if (/DNS|hostname|name resolution|ENOTFOUND|EAI_AGAIN/i.test(message))
    return "dns_failure" as const;
  if (/redirect/i.test(message)) return "redirect_rejected" as const;
  if (/network connection lost|connection.{0,20}(?:reset|closed|lost)|socket hang up/i.test(message))
    return "connection_lost" as const;
  if (/connection refused|ECONNREFUSED/i.test(message))
    return "connection_refused" as const;
  if (/timeout|timed out/i.test(message)) return "connection_timeout" as const;
  if (/not implemented|not supported|unsupported|invalid.{0,30}(?:option|signal|request)/i.test(message))
    return "request_unsupported" as const;
  if (/fetch failed/i.test(message)) return "fetch_failed" as const;
  return "unclassified" as const;
}
