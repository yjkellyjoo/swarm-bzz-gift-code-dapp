/**
 * The two shapes gift codes leave the app in.
 *
 * Both the copy buttons and the downloads go through here, so a file and the
 * clipboard can never disagree about what an export contains.
 */

/**
 * Structurally satisfied by both GiftCode and BatchResult, so neither has to
 * change to be exportable.
 */
export interface ExportableCode {
    privateKey: string;
    address: string;
    batchId?: string;
}

export const GIFT_CODE_TABLE_HEADERS = ['privateKey', 'address', 'batchId'] as const;

/**
 * Bare keys, one per line.
 *
 * Deliberately nothing else: this is what a wallet or a paste box expects, and
 * anything else on the line stops it being read back.
 */
export function buildKeyList(codes: ExportableCode[]): string {
    return codes.map(code => code.privateKey).join('\n');
}

/**
 * Tab-separated key/address/batch, with a header row.
 *
 * Tabs rather than commas because parseGiftDriveList recognises this shape by
 * the address in field 2 and keeps the batch id out of the key column. A batch
 * id is itself a valid private key, so that column position is the only thing
 * telling them apart.
 */
export function buildGiftCodeTable(codes: ExportableCode[]): string {
    return [
        GIFT_CODE_TABLE_HEADERS.join('\t'),
        ...codes.map(code => [code.privateKey, code.address, code.batchId ?? ''].join('\t')),
    ].join('\n');
}
