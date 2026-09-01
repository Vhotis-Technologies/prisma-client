/**
 * Turn RTK Query / axios errors into a short user-facing string.
 * Never returns HTML (Django, nginx, ngrok interstitial pages).
 */

const DEFAULT_FALLBACK = "Something went wrong. Please try again.";

function looksLikeHtml(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.startsWith("<") ||
    /<!doctype html/i.test(trimmed) ||
    /<\/?[a-z][\s\S]*>/i.test(trimmed)
  );
}

function fromText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || looksLikeHtml(trimmed) || trimmed.length > 280) {
    return null;
  }
  return trimmed;
}

function fromBody(data: unknown): string | null {
  if (data == null) return null;
  if (typeof data === "string") return fromText(data);
  if (typeof data === "object") {
    const record = data as Record<string, unknown>;
    for (const key of ["error", "detail", "message"]) {
      const text = fromText(record[key]);
      if (text) return text;
    }
  }
  return null;
}

function statusMessage(status: unknown): string | null {
  if (status === "FETCH_ERROR" || status === "TIMEOUT_ERROR") {
    return "Couldn’t reach the server. Check your connection and try again.";
  }
  if (typeof status !== "number") return null;
  if (status === 401) return "Please sign in again and try again.";
  if (status === 403) return "You don’t have access to this information.";
  if (status === 404) return "That information could not be found.";
  if (status === 408 || status === 504) {
    return "The request timed out. Check your connection and try again.";
  }
  if (status >= 500) {
    return "The server had a problem. Please try again in a moment.";
  }
  return null;
}

export function apiErrorMessage(
  error: unknown,
  fallback: string = DEFAULT_FALLBACK
): string {
  if (error == null) return fallback;

  if (typeof error === "object") {
    const err = error as {
      status?: unknown;
      originalStatus?: unknown;
      data?: unknown;
      error?: unknown;
      message?: unknown;
    };
    const fromPayload =
      fromBody(err.data) ?? fromBody(err.error) ?? fromText(err.message);
    if (fromPayload && fromPayload !== "Network Error") {
      return fromPayload;
    }
    return (
      statusMessage(err.status) ??
      statusMessage(err.originalStatus) ??
      (fromText(err.message) === "Network Error"
        ? "Couldn’t reach the server. Check your connection and try again."
        : null) ??
      fallback
    );
  }

  return fromText(error) ?? fallback;
}
