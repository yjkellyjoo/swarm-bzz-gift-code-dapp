import { ethers } from 'ethers';
import { decodeGiftPayload } from './giftPayload';

/**
 * The one parser for every list an operator can paste.
 *
 * Handles bare keys (comma- or newline-separated), the tab-separated Copy
 * Codes export including its header row, and the JSON payload scanned off a
 * gift drive QR.
 *
 * Structured payloads are read per line rather than split on commas, because
 * the payload is JSON and carries commas of its own.
 *
 * Deliberately does not de-duplicate: a repeated key is an error the caller
 * should surface, not something to quietly drop. giftKit/items.ts rejects
 * duplicates because two cards carrying one key means one gift handed out
 * twice and another not at all.
 */

export interface GiftDriveEntry {
    privateKey: string;
    batchId?: string;
}

const BATCH_ID_RE = /^0x[0-9a-fA-F]{64}$/;

export function parseGiftDriveList(input: string): GiftDriveEntry[] {
    if (!input.trim()) return [];

    const entries: GiftDriveEntry[] = [];
    const invalid: string[] = [];

    const add = (token: string, label: string) => {
        const decoded = decodeGiftPayload(token);
        if (!decoded) {
            invalid.push(`${label}: ${token.substring(0, 12)}...`);
            return;
        }

        const entry: GiftDriveEntry = { privateKey: decoded.privateKey };
        if (decoded.batchId) entry.batchId = decoded.batchId;
        entries.push(entry);
    };

    const lines = input
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

    lines.forEach((line, i) => {
        const label = `Line ${i + 1}`;

        // A structured payload is one whole line - do not split it.
        if (line.startsWith('{')) {
            add(line, label);
            return;
        }

        // The Copy Codes export header.
        if (line.toLowerCase().startsWith('privatekey')) return;

        // A row from the Copy export is privateKey/address/batchId, and only
        // its first field is a key - the batch ID must never be read as one.
        //
        // Recognised by the address in field 2, not by the tabs alone: a
        // column of keys copied out of a spreadsheet is also tab-separated,
        // and treating that as an export row would silently keep only the
        // first key and drop the rest.
        const fields = line.split('\t').map(f => f.trim());
        if (fields.length >= 2 && ethers.isAddress(fields[1])) {
            const decoded = decodeGiftPayload(fields[0]);

            if (!decoded) {
                invalid.push(`${label}: ${fields[0].substring(0, 12)}...`);
                return;
            }

            const entry: GiftDriveEntry = { privateKey: decoded.privateKey };
            const batchId = fields[2] ?? '';
            if (BATCH_ID_RE.test(batchId)) entry.batchId = batchId;
            entries.push(entry);
            return;
        }

        // Otherwise tabs are just separators, like commas.
        line
            .split(/[,\t]/)
            .map(token => token.trim())
            .filter(token => token.length > 0)
            .forEach(token => add(token, label));
    });

    if (invalid.length > 0) {
        throw new Error(`Invalid private keys found:\n${invalid.join('\n')}`);
    }

    return entries;
}
