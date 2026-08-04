export function homeLauncherUrl(): string {
  const raw = String(import.meta.env.VITE_HOME_URL || import.meta.env.VITE_HEAD_URL_HOME || "").trim();
  return raw.replace(/\/+$/, "") || "https://www.eliteosfab.com";
}
