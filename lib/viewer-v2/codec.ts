import { BBPREVIEW_LIMITS, BBPREVIEW_MIME, type BbPreview } from './schema';
import { validateBbPreview } from './validate';

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function encodeBbPreview(preview: BbPreview): Blob {
  const validated = validateBbPreview(preview);
  const text = JSON.stringify(validated);
  if (utf8Bytes(text) > BBPREVIEW_LIMITS.maxPreviewBytes) {
    throw new Error('Generated preview exceeds the 50 MiB preview limit.');
  }
  return new Blob([text], { type: BBPREVIEW_MIME });
}

export function decodeBbPreview(text: string): BbPreview {
  if (utf8Bytes(text) > BBPREVIEW_LIMITS.maxPreviewBytes) {
    throw new Error('Preview exceeds the 50 MiB preview limit.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error('Preview contains malformed JSON.');
  }
  return validateBbPreview(parsed);
}
