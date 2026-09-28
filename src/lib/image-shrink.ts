/**
 * lib/image-shrink.ts — make a pasted/attached image fit the daemon.
 *
 * The daemon refuses any request body over 4 MB (MAX_BODY_BYTES) and the
 * composer sends images inline as base64 data URLs. Two full-size photo
 * screenshots were enough to hit it (mf27, 2026-09-29: "Payload too
 * large … images:2") — and the models downscale anything past ~2000 px
 * anyway, so the extra bytes bought nothing.
 *
 * Each image is re-encoded (WebP, JPEG fallback) to at most MAX_EDGE px
 * and BYTE_BUDGET bytes, so six of them plus text stay under the limit.
 * Small images pass through untouched.
 */

/** Longest edge sent to the model. */
export const MAX_EDGE = 2000;
/** Per-image budget: 6 × 450 KB × 4/3 (base64) ≈ 3.6 MB < 4 MB. */
export const BYTE_BUDGET = 450 * 1024;

/** Scale (w, h) so the longest edge is at most `max`. Pure. */
export function fitEdge(w: number, h: number, max: number): { w: number; h: number } {
  const long = Math.max(w, h);
  if (long <= max || long <= 0) return { w, h };
  const k = max / long;
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

function readAsDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

function encode(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
}

/** The image as a data URL that fits the budget. Falls back to the
 *  original bytes when the browser cannot decode or re-encode it. */
export async function shrinkImage(file: Blob): Promise<{ dataURL: string; mediaType: string }> {
  const original = async () => ({ dataURL: await readAsDataURL(file), mediaType: file.type || 'image/png' });
  if (file.type === 'image/gif') return original(); // keep animation
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    return original();
  }
  try {
    if (file.size <= BYTE_BUDGET && Math.max(bmp.width, bmp.height) <= MAX_EDGE) return await original();
    let edge = MAX_EDGE;
    let best: Blob | null = null;
    for (let pass = 0; pass < 4; pass += 1) {
      const { w, h } = fitEdge(bmp.width, bmp.height, edge);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return await original();
      ctx.drawImage(bmp, 0, 0, w, h);
      for (const q of [0.85, 0.7, 0.55]) {
        let b = await encode(canvas, 'image/webp', q);
        if (!b || b.type !== 'image/webp') b = await encode(canvas, 'image/jpeg', q);
        if (!b) continue;
        if (!best || b.size < best.size) best = b;
        if (b.size <= BYTE_BUDGET) return { dataURL: await readAsDataURL(b), mediaType: b.type };
      }
      edge = Math.round(edge * 0.75);
    }
    return best ? { dataURL: await readAsDataURL(best), mediaType: best.type } : await original();
  } finally {
    bmp.close();
  }
}

/** An already-attached image (data URL) brought within budget — covers
 *  images attached before this existed, restored after a failed send. */
export async function fitAttached(img: { dataURL: string; mediaType: string }): Promise<{ dataURL: string; mediaType: string }> {
  if (img.dataURL.length <= Math.ceil((BYTE_BUDGET * 4) / 3) + 64) return img;
  try {
    const blob = await (await fetch(img.dataURL)).blob();
    return await shrinkImage(blob);
  } catch {
    return img;
  }
}
