export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}
export function requiredEnv(name: string) {
  if (typeof window !== "undefined")
    throw new Error("Server configuration is not available in a browser");
  const value = process.env[name];
  if (!value)
    throw new ApiError(
      "SERVICE_NOT_CONFIGURED",
      503,
      "This service is being configured. Please try again later.",
    );
  return value;
}
export function configured() {
  return Boolean(
    process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY,
  );
}
export function appOrigin() {
  const url = new URL(requiredEnv("APP_URL"));
  if (
    url.username || url.password || (url.protocol !== "https:" &&
    !(
      process.env.NODE_ENV !== "production" &&
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
    ))
  )
    throw new ApiError(
      "SERVICE_NOT_CONFIGURED",
      503,
      "A secure application URL must be configured.",
    );
  return url.origin;
}
export function sameOrigin(request: Request) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return;
  if (request.headers.get("origin") !== appOrigin())
    throw new ApiError(
      "CSRF_REJECTED",
      403,
      "This request could not be verified. Reload the page and try again.",
    );
}
export async function jsonBody(request: Request, maxBytes = 12000) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > maxBytes)
    throw new ApiError("PAYLOAD_TOO_LARGE", 413, "Request is too large.");
  if ((request.headers.get("content-type") || "").split(";")[0].trim().toLowerCase() !== "application/json")
    throw new ApiError("INVALID_CONTENT_TYPE", 415, "Send a JSON request.");
  const reader = request.body?.getReader();
  if (!reader) return {};
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new ApiError("PAYLOAD_TOO_LARGE", 413, "Request is too large.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ApiError("INVALID_JSON", 400, "Request contains invalid JSON.");
  }
}
export function safeReturnPath(value: string | null, fallback = "/app") {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\r\n]/.test(value)
  )
    return fallback;
  const url = new URL(value, "https://app.local");
  return url.origin === "https://app.local"
    ? url.pathname + url.search
    : fallback;
}
export function safeIdempotency(request: Request) {
  const key = request.headers.get("idempotency-key");
  if (!key || !/^[A-Za-z0-9_-]{16,100}$/.test(key))
    throw new ApiError(
      "IDEMPOTENCY_KEY_REQUIRED",
      400,
      "A valid Idempotency-Key is required.",
    );
  return key;
}
export function dbError(error: { code?: string; message?: string } | null) {
  if (!error) return;
  const known: Record<string, [string, number, string]> = {
    LINK_LIMIT: ["LINK_LIMIT", 409, "This location has reached its limit of 500 QR and NFC links."],
    IDEMPOTENCY_CONFLICT: ["IDEMPOTENCY_CONFLICT", 409, "This request key was already used for a different link. Reload and try again."],
    INVALID_LINK_UPDATE: ["VALIDATION_FAILED", 422, "A link’s location and channel cannot be changed."],
    INVALID_IDEMPOTENCY_KEY: ["IDEMPOTENCY_KEY_REQUIRED", 400, "A valid request key is required."],
    ACTIVE_SUBSCRIPTION: [
      "ACTIVE_SUBSCRIPTION",
      409,
      "Cancel your current subscription and wait for the paid period to end before choosing a new plan.",
    ],
    TENANT_ACCESS_DENIED: [
      "TENANT_ACCESS_DENIED",
      404,
      "The resource was not found.",
    ],
    LOCATION_LIMIT: [
      "LOCATION_LIMIT",
      429,
      "Your plan’s location limit has been reached.",
    ],
    AI_QUOTA_EXCEEDED: [
      "AI_QUOTA_EXCEEDED",
      429,
      "Writing assistance has reached its limit. You can still use Google directly.",
    ],
    QR_INACTIVE: ["QR_INACTIVE", 410, "This review link is no longer active."],
    SESSION_EXPIRED: [
      "SESSION_EXPIRED",
      401,
      "Your session expired. Please refresh while keeping your text.",
    ],
    INVITATION_INVALID: [
      "INVITATION_INVALID",
      422,
      "This invitation is invalid or expired.",
    ],
    ROLE_REQUIRED: [
      "ROLE_REQUIRED",
      403,
      "You do not have permission for this action.",
    ],
    INVALID_REVIEW_URL: [
      "INVALID_REVIEW_URL",
      422,
      "Confirm a supported Google review destination before activation.",
    ],
    PLAN_CHANGE_PENDING: [
      "BILLING_PAYMENT_PENDING",
      409,
      "A billing change is already pending.",
    ],
  };
  for (const [code, [name, status, message]] of Object.entries(known))
    if (error.message?.includes(code))
      throw new ApiError(name, status, message);
  if (error.code === "23514")
    throw new ApiError(
      "VALIDATION_FAILED",
      422,
      "Check the destination confirmation and supplied fields.",
    );
  if (error.code === "23505")
    throw new ApiError("CONFLICT", 409, "This record already exists.");
  if (error.code === "42501")
    throw new ApiError(
      "TENANT_ACCESS_DENIED",
      404,
      "The resource was not found.",
    );
  throw new ApiError(
    "DATABASE_UNAVAILABLE",
    503,
    "The service could not complete this request. Please try again.",
  );
}
