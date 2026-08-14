/**
 * lib/media/download.ts — save a generated picture to the device.
 *
 * ============================================================================
 * WHY THIS IS NOT `<a href={src} download>`
 * ============================================================================
 *
 * That is what ToolMediaStudio does, and it works there for one reason only:
 * the thing it links to is a `data:` URL, which counts as same-origin.
 *
 * Every OTHER picture in this product is a Supabase Storage public URL on
 * a different origin, and the HTML `download` attribute is IGNORED
 * cross-origin by every current browser. The tag does not fail loudly — it
 * silently degrades to a navigation, so the operator taps "Download" and gets
 * the image opened in a tab instead of saved. On Android Chrome, which is the
 * only browser this project is actually driven from, that means a long-press
 * and a second menu to do the thing the button claimed to do.
 *
 * So a cross-origin file is fetched into a Blob first. A blob: URL IS
 * same-origin, and the download attribute is honoured against it.
 *
 * ============================================================================
 * IT DEGRADES TO OPENING THE FILE, AND SAYS SO
 * ============================================================================
 *
 * The fetch needs CORS. Supabase Storage sends permissive CORS headers on
 * public objects, so this normally succeeds — but a proxy, an extension or a
 * future bucket policy can take that away, and when it does the fetch throws.
 *
 * The fallback opens the file in a new tab, which is exactly what the plain
 * anchor would have done. The return value distinguishes the two so the caller
 * can tell the truth about which happened rather than showing "Saved" over a
 * download that never started.
 */

export type DownloadOutcome = 'downloaded' | 'opened';

/**
 * Strip anything a file system might object to.
 *
 * Combination keys are the main input here and they look like
 * `system=flake&flake_blend=domino&topcoat=gloss` — ampersands and equals
 * signs are legal on Linux and Android, awkward on Windows, and genuinely
 * hostile in a shell. Reduced to a conservative set, collapsed, and capped, so
 * the name stays readable and identifies the combination it came from.
 */
export function safeFilename(base: string, extension = 'webp'): string {
  const cleaned = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return (cleaned.length > 0 ? cleaned : 'image') + '.' + extension;
}

/** Guess an extension from the URL, falling back to the blob's own type. */
function extensionFor(src: string, blobType: string): string {
  const fromUrl = /\.([a-z0-9]{3,4})(?:\?|#|$)/i.exec(src.split('?')[0] ?? '');
  if (fromUrl && fromUrl[1]) return fromUrl[1].toLowerCase();
  const fromType = blobType.split('/')[1];
  if (fromType) return fromType.split(';')[0] ?? 'webp';
  return 'webp';
}

function clickAnchor(href: string, filename: string): void {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.rel = 'noopener';
  // Appended to the document because Firefox will not honour a click on a
  // detached anchor. Removed immediately afterwards.
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export async function downloadImage(src: string, baseName: string): Promise<DownloadOutcome> {
  // A data: or blob: URL is already same-origin; no fetch, no CORS, no delay.
  if (src.startsWith('data:') || src.startsWith('blob:')) {
    clickAnchor(src, safeFilename(baseName, src.startsWith('data:') ? dataExtension(src) : 'webp'));
    return 'downloaded';
  }

  try {
    const res = await fetch(src, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    try {
      clickAnchor(objectUrl, safeFilename(baseName, extensionFor(src, blob.type)));
    } finally {
      /**
       * Revoked on a timer, not immediately.
       *
       * Revoking in the same tick as the click cancels the download in Safari
       * and intermittently in Chrome — the browser has not finished reading
       * the blob when the handle disappears. Ten seconds is far longer than a
       * local blob read needs and the memory is reclaimed either way when the
       * tab closes.
       */
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
    }
    return 'downloaded';
  } catch {
    window.open(src, '_blank', 'noopener,noreferrer');
    return 'opened';
  }
}

function dataExtension(src: string): string {
  const m = /^data:([^;,]+)/.exec(src);
  const type = m?.[1] ?? '';
  const sub = type.split('/')[1];
  return sub && sub.length <= 5 ? sub : 'webp';
}
