export class ClientError extends Error {
  constructor(
    message: string,
    public code: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}
export async function api<T = unknown>(
  path: string,
  method = "GET",
  body?: unknown,
  key?: string,
): Promise<T> {
  const response = await fetch(`/api/v1/${path}`, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { "Idempotency-Key": key } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const result = (await response.json().catch(() => {
    throw new ClientError("The service returned an unexpected response. Please try again.", "INVALID_RESPONSE");
  })) as {
    data: T;
    error?: { message: string; code: string; fields?: Record<string, string> };
  };
  if (!response.ok)
    throw new ClientError(
      result.error?.message || "Request could not be completed.",
      result.error?.code || "REQUEST_FAILED",
      result.error?.fields,
    );
  return result.data;
}
export function errorMessage(error: unknown) {
  return error instanceof ClientError
    ? error.message +
        (error.fields
          ? " " +
            Object.entries(error.fields)
              .map(([k, v]) => `${k}: ${v}`)
              .join(" ")
          : "")
    : error instanceof Error
      ? error.message
      : "Please try again.";
}
