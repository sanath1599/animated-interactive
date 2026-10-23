import { getConfig } from "@/lib/config";

/** CSRF defence for mutating requests: Origin (or Referer) must match APP_URL. */
export function isSameOrigin(req: Request): boolean {
  const { appUrl } = getConfig();
  const origin = req.headers.get("origin");
  if (origin) return origin === appUrl;
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin === appUrl;
    } catch {
      return false;
    }
  }
  return false;
}
