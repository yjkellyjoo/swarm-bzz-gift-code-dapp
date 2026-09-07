import { zipSync } from 'fflate';

/**
 * PNG, xlsx and PDF are all already-compressed containers, so re-deflating
 * them costs time and gains nothing.
 */
export function packKit(entries: Record<string, Uint8Array>): Uint8Array {
  return zipSync(entries, { level: 0 });
}
