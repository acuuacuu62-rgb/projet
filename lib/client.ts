export const API = process.env.NEXT_PUBLIC_API_URL || "/api";
let csrf = "";
export function setCsrf(s: string) {
  csrf = s || "";
}
export async function api(path: string, method = "GET", body?: unknown) {
  const r = await fetch(API + path, {
    method,
    credentials: "include",
    headers: {
      ...(method !== "GET"
        ? { "Content-Type": "application/json", "X-CSRF-Token": csrf }
        : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
  });
  const result = await r
    .json()
    .catch(() => ({ error: "The service returned an invalid response" }));
  if (!r.ok) throw new Error(result.error || "Request failed");
  return result;
}
export function download(name: string, content: string) {
  const url = URL.createObjectURL(
    new Blob([content], { type: "text/plain;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name.replace(/[^a-zA-Z0-9_.-]/g, "_");
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
export const relative = (date: string) => {
  const s = Math.max(0, (Date.now() - Date.parse(date)) / 1000);
  return s < 60
    ? "Just now"
    : s < 3600
      ? `${Math.floor(s / 60)}m ago`
      : s < 86400
        ? `${Math.floor(s / 3600)}h ago`
        : new Date(date).toLocaleDateString();
};
