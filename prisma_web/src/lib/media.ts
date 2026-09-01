export function mediaUrl(path: string | null | undefined): string {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  const api = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  try {
    return `${new URL(api).origin}${suffix}`;
  } catch {
    return `${api}${suffix}`;
  }
}

export function dateKey(value: string): string {
  return value.slice(0, 10);
}
