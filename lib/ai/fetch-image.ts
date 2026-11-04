import { supabaseUrl } from "@/lib/supabase/env";

export type ModelImage = { data: string; mediaType: "image/jpeg" | "image/png" | "image/webp" };

const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/** Our own storage and Imgflip's meme templates. */
const ALLOWED_HOSTS = [new URL(supabaseUrl).hostname, "i.imgflip.com"];

export function isAllowedImageUrl(raw: string) {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && ALLOWED_HOSTS.includes(url.hostname);
  } catch {
    return false;
  }
}

/** Downloads a photo for the model, refusing unknown hosts, odd formats, and huge files. */
export async function fetchImage(rawUrl: string, maxBytes = 6 * 1024 * 1024): Promise<ModelImage> {
  if (!isAllowedImageUrl(rawUrl)) throw new Error(`image host not allowed: ${new URL(rawUrl).hostname}`);
  const res = await fetch(rawUrl, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
  if (!res.ok) throw new Error(`image responded ${res.status}`);

  const mediaType = MEDIA_TYPES.find((t) => t === res.headers.get("content-type")?.split(";")[0].trim());
  if (!mediaType) throw new Error(`unsupported image type: ${res.headers.get("content-type")}`);

  const bytes = await res.arrayBuffer();
  if (bytes.byteLength > maxBytes) throw new Error(`image too large: ${bytes.byteLength} bytes`);
  return { data: Buffer.from(bytes).toString("base64"), mediaType };
}
