/**
 * Photos for the agent. A phone photo is several megabytes; the model doesn't need that, so each photo is
 * shrunk in the browser (longest side 1280 px, JPEG) before it is sent. A tiny thumbnail is kept too, for
 * showing in the conversation and for saving it with the chat (the full picture is never stored).
 */

export interface PreparedImage {
  mimeType: "image/jpeg";
  /** base64 without the "data:" prefix: what the server and the model receive. */
  data: string;
  /** A small data URL for the page. */
  thumb: string;
}

export const MAX_PHOTOS = 3;
const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_SIDE = 1280;
const THUMB_SIDE = 160;
/** The server refuses more than this many base64 characters per photo (see app/api/agent/route.ts). */
const MAX_BASE64_CHARS = 2_400_000;

function render(bitmap: ImageBitmap, side: number, quality: number): string {
  const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Shfletuesi nuk e përpunoi dot foton.");
  ctx.fillStyle = "#fff"; // transparent PNGs would turn black in a JPEG
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

/** Throws an Error whose message is meant for the person (in Albanian). */
export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!file.type.startsWith("image/")) throw new Error("Ky skedar nuk është foto.");
  if (file.size > MAX_FILE_BYTES) throw new Error("Fotoja është shumë e madhe (maksimumi 15 MB).");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Nuk e hapa dot këtë foto. Provo një JPG ose PNG.");
  }
  try {
    let full = render(bitmap, MAX_SIDE, 0.82);
    if (full.length > MAX_BASE64_CHARS) full = render(bitmap, 1000, 0.65);
    if (full.length > MAX_BASE64_CHARS) throw new Error("Fotoja është shumë e madhe.");
    return { mimeType: "image/jpeg", data: full.slice(full.indexOf(",") + 1), thumb: render(bitmap, THUMB_SIDE, 0.7) };
  } finally {
    bitmap.close();
  }
}
