/**
 * The batch name, and the filenames derived from it.
 *
 * One name covers every file the app writes - the two downloads and the
 * handout kit's zip, spreadsheet and printable sheet - so it lives here rather
 * than inside any one of them.
 */

export const DEFAULT_BATCH_NAME = 'Swarm BZZ Gift Codes';

/**
 * Excel rejects * ? : \ / [ ] in a worksheet name, and a slash in a filename
 * would nest the zip entry in a phantom folder. The batch name is free text
 * from an event organiser, so "ETHRome 2026: batch 1/2" is entirely plausible
 * and must not abort the export.
 */
export function sanitiseBatchName(base: string): string {
    const cleaned = base.replace(/[*?:\\/[\]]/g, '-').replace(/\s+/g, ' ').trim();
    return cleaned || 'Gift codes';
}

/** Keys only, one per line - the plain-text sibling of Copy Codes. */
export function giftCodesFileName(base: string): string {
    return `${sanitiseBatchName(base)} - gift codes.txt`;
}

/** key/address/batchId, matching the handout kit's naming convention. */
export function giftDrivesFileName(base: string): string {
    return `${sanitiseBatchName(base)} - gift drives.tsv`;
}
