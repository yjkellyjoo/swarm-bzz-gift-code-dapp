# Gift Drives Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split postage-batch creation out of the code-generation form into its own step — a "gift drive" — that runs on either this session's gift codes or a pasted key list, and carry gift drives through the handout kit so a kit QR holds the batch alongside the key.

**Architecture:** Three stacked steps on the Generate page, each independently able to take session data or a pasted list: (1) generate gift codes, (1-1) create gift drives, (2) build the handout kit. Batch settings and chain reads move out of `GenerateCodes` into a self-contained `GiftDriveStep`. The QR payload stays the bare private key for a plain gift code and becomes a compact JSON object once that code has a gift drive, so a wallet can still scan-and-import a plain code.

**Tech Stack:** React 19, TypeScript (strict, `verbatimModuleSyntax`, `erasableSyntaxOnly`), Vite 7, ethers v6, Tailwind + shadcn/ui, vitest, `qrcode`, and (from PR #2) exceljs / pdf-lib / pdfjs-dist / zxing-wasm / fflate.

**Spec:** No standalone spec doc. The design is fixed by:
- PR #1 plan: `~/.claude/plans/let-s-create-a-feature-resilient-whistle.md`
- PR #1 (postage batches): https://github.com/yjkellyjoo/swarm-bzz-gift-code-dapp/pull/1
- PR #2 (handout kit): https://github.com/yjkellyjoo/swarm-bzz-gift-code-dapp/pull/2

## Flow being built

```
1.    Generate gift codes            (session)        existing
1-1.  Create gift drives             (session | paste)   NEW  - Phase A
2.    Build handout kit              (session | paste)   PR #2, extended in Phase B
```

Both 1-1 and 2 must work from a pasted list, so an operator can return to codes generated in an earlier session.

## Global Constraints

Every task's requirements implicitly include this section.

- **Precondition: PR #2 is merged into `main` and PR #1 is rebased onto it.** Phase B edits `src/lib/giftKit/*`, which exists only on PR #2. Do not start Phase B before that merge.
- **`vitest` is `^4.1.11`.** PR #2 owns the version and the config. Do not bump to 5.x. Vitest config lives in `vite.config.ts` as `test: { environment: 'node', include: ['src/**/*.test.ts'] }` — test files must therefore be `src/**/*.test.ts`.
- **QR payload rule.** No gift drive → the bare `0x`-prefixed private key, byte-for-byte, so a wallet scanning it imports directly. Gift drive present → `{"v":1,"pk":"0x…","batch":"0x…"}` and nothing else. **`depth`, `enc` and `imm` must never appear in the QR** — see Task 1 for why.
- **A private key is never printed as text, logged, or sent off-origin.** It travels only inside a QR and in the xlsx `Private key` column. PR #2's rule; keep it.
- **`MM_PER_MODULE_FLOOR` is 0.6 mm** (`src/lib/giftKit/modulePitch.ts`). Assert `pitch >= MM_PER_MODULE_FLOOR`, **never an exact module count** — `node-qrcode`'s segment optimiser mixes numeric and byte runs, so the version varies with the hex content of each key. That variance is exactly why `maxQrVersion` pins one version per batch.
- **`parsePrivateKeys` must not de-duplicate.** `src/lib/giftKit/items.ts` treats a duplicate as a hard error, because two cards carrying the same key means one gift handed out twice and another not at all. Silent de-duplication suppresses that error and hands the operator N−1 cards without saying so.
- **Terminology.** User-facing copy says "gift drive". Code keeps `batchId`, `createBatch`, `batchDepth` etc., matching the PostageStamp contract so the Solidity stays readable against it. A gift drive *is* a postage batch owned by a gift wallet.
- **Format xBZZ with `CONFIG.BZZ_DECIMALS`** (16). Never the literal `16`.
- **Erasure coding is fixed at none.** Not configurable, shown read-only.
- PostageStamp on Gnosis: `0x45a1502382541Cd610CC9068e88727426b696293`. BZZ: `CONFIG.XBZZ_TOKEN_ADDRESS`.
- **Do not touch** `src/App.css`, `src/components/TabSwitcher.tsx`, `src/components/RecoveryForm.tsx`, the duplicate ABIs in `blockchainUtils.ts`, or the `globalRpcUrl` module global. Read the RPC URL via `getGlobalRpcUrl()` as `RecoverFunds.tsx` does.
- `pnpm lint` must introduce **no new** errors. `main` has pre-existing ones (`no-explicit-any` in `gnosisContract.ts`, `react-refresh` in `WalletBalanceCard.tsx` and `ui/button.tsx`); leave them.

---

## File Structure

**Phase A — split the step out (no dependency on PR #2's kit)**

| File | Responsibility |
|---|---|
| `src/lib/giftDriveList.ts` | **Create.** The single parser for every pasted-list shape: bare keys, comma lists, the tab-separated Copy Codes export, and JSON QR payloads. Returns key + optional batch ID. |
| `src/lib/giftDriveList.test.ts` | **Create.** Parser tests. |
| `src/lib/walletUtils.ts` | **Modify.** `parsePrivateKeys` becomes a thin wrapper over `parseGiftDriveList`, keeping its existing contract (throws on invalid, no de-duplication) so PR #2's callers need no change. |
| `src/lib/giftPayload.ts` | **Modify.** Trim the encoded payload to `{v,pk,batch}`. Decoder stays tolerant of the older longer form. |
| `src/lib/postageBatch.ts` | **Modify.** Add `preflightBatchWallets` so an unaffordable run is caught before any gas is spent. |
| `src/components/GiftDriveStep.tsx` | **Create.** The whole step: source toggle, settings, live readout, preflight, run, results. Owns its own persisted settings. |
| `src/pages/GenerateCodes.tsx` | **Modify.** Remove all batch UI/state; render `<GiftDriveStep>`. Reverts close to its pre-PR-#1 shape. |
| `src/lib/types.ts` | **Modify.** `WalletFormData` drops the four `batch*` fields (they move into `GiftDriveStep`). `GiftCode` keeps its gift-drive fields. |
| `src/lib/qrUtils.ts` | **Modify.** Drop PR #1's print-sheet work — PR #2 deletes those functions. |

**Phase B — carry gift drives through the kit (requires PR #2 merged)**

| File | Responsibility |
|---|---|
| `src/lib/giftKit/payload.ts` | **Create.** `itemPayload(item)` — the one place the kit turns an item into QR text. |
| `src/lib/giftKit/types.ts` | **Modify.** `GiftKitItem` gains `batchId?`; `GiftKitOptions` gains `driveByKey?`. |
| `src/lib/giftKit/items.ts` | **Modify.** Optional second parameter attaches batch IDs. |
| `src/lib/giftKit/buildGiftKit.ts` | **Modify.** QR text comes from `itemPayload`. |
| `src/lib/giftKit/verify.ts` | **Modify.** All three decode-back comparisons use `itemPayload`. |
| `src/lib/giftKit/xlsxSpec.ts` | **Modify.** Append a `Gift drive` column. |
| `src/lib/giftKit/xlsxWrite.ts` / `xlsxRead.ts` | **Modify.** Write and read that column. |
| `src/components/GiftKitExport.tsx` | **Modify.** Take gift drives from the session, and recover them from a pasted export. |
| PR #2's existing tests | **Modify.** `items.test.ts`, `xlsx.test.ts`, `qrRoundTrip.test.ts`, `buildGiftKit.test.ts`, `pdfVerify.test.ts`. |

---

# Phase A — Split the gift drive step out

### Task 1: Trim the QR payload

The payload has to grow to hold a batch ID, and QR size is the constraint that decides whether a printed card still scans. Measured against PR #2's 4×5 A4 grid (QR 35.4 mm, floor 0.6 mm/module):

| payload | chars | version | modules | mm/module at 4×5 |
|---|---|---|---|---|
| bare key | 66 | 5 | 37 | 0.957 — fine |
| `{v,pk,batch,depth,enc,imm}` | 192 | 10 | 57 | **0.621 — only 3.5% clear of the floor** |
| `{v,pk,batch}` | 158 | 8 | 49 | 0.722 — 20% clear |

So `depth`/`enc`/`imm` come out of the QR. They are informational, and the operator has them in the xlsx. Dropping them buys back two QR versions and means **PR #2's card geometry needs no change at all**. Worst case across a batch is around version 10 (0.621 mm), still above the floor, with `assessScannability` as the backstop.

**Files:**
- Modify: `src/lib/giftPayload.ts`
- Test: `src/lib/giftPayload.test.ts`

**Interfaces:**
- Consumes: `GiftCode` from `src/lib/types.ts`.
- Produces: `encodeGiftPayload(code: GiftCode): string` (unchanged signature, shorter output); `decodeGiftPayload(text: string): DecodedGiftPayload | null`; `isValidPrivateKey(key: string): boolean`.

- [ ] **Step 1: Write the failing tests**

In `src/lib/giftPayload.test.ts`, replace the `encodeGiftPayload` describe block's "returns compact JSON once a batch exists" and "omits fields that are not set" tests with:

```ts
    it('encodes only version, key and batch', () => {
        const payload = encodeGiftPayload(
            code({ batchId: BATCH_ID, batchDepth: 20, encrypted: true, immutable: false })
        );

        // depth/enc/imm are deliberately absent: they cost two QR versions,
        // which is the difference between a card that scans off print and one
        // that does not. They live in the xlsx instead.
        expect(JSON.parse(payload)).toEqual({ v: 1, pk: PRIVATE_KEY, batch: BATCH_ID });
    });

    it('stays inside the QR budget that keeps a printed card scannable', () => {
        const payload = encodeGiftPayload(
            code({ batchId: BATCH_ID, batchDepth: 20, encrypted: true, immutable: false })
        );
        expect(payload.length).toBeLessThanOrEqual(160);
    });
```

And in the `decodeGiftPayload` describe block, replace the "round-trips a structured payload" test with:

```ts
    it('round-trips the key and batch', () => {
        const original = code({ batchId: BATCH_ID, batchDepth: 20, encrypted: true });

        expect(decodeGiftPayload(encodeGiftPayload(original))).toEqual({
            privateKey: PRIVATE_KEY,
            batchId: BATCH_ID,
        });
    });

    it('still reads a payload that carries the older extra fields', () => {
        const legacy = JSON.stringify({
            v: 1, pk: PRIVATE_KEY, batch: BATCH_ID, depth: 20, enc: true, imm: false,
        });

        expect(decodeGiftPayload(legacy)).toEqual({
            privateKey: PRIVATE_KEY,
            batchId: BATCH_ID,
            batchDepth: 20,
            encrypted: true,
            immutable: false,
        });
    });
```

Also update the `QR encoding of a payload` describe block's size assertion from `toBeLessThan(250)` to `toBeLessThanOrEqual(160)`.

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `pnpm test src/lib/giftPayload.test.ts`
Expected: FAIL — the encoder still emits `depth`/`enc`/`imm`.

- [ ] **Step 3: Trim the encoder**

In `src/lib/giftPayload.ts`, replace the body of `encodeGiftPayload` after the early return with:

```ts
    // Only the version, key and batch. Every extra field costs QR modules, and
    // at 20 cards to an A4 page the printed module pitch is the binding
    // constraint -- see docs/superpowers/plans/2026-09-07-gift-drives.md Task 1.
    const payload: StructuredGiftPayload = {
        v: GIFT_PAYLOAD_VERSION,
        pk: code.privateKey,
        batch: code.batchId,
    };

    return JSON.stringify(payload);
```

Then make the three optional fields optional on the type so the decoder still reads them:

```ts
interface StructuredGiftPayload {
    v: number;
    pk: string;
    batch: string;
    depth?: number;
    enc?: boolean;
    imm?: boolean;
}
```

Leave `decodeGiftPayload` alone — it already reads those fields when present.

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm test src/lib/giftPayload.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/giftPayload.ts src/lib/giftPayload.test.ts
git commit -m "refactor: trim the gift drive QR payload to key and batch"
```

---

### Task 2: One parser for every pasted-list shape

Both the gift drive step and the handout kit accept a pasted list, and once gift drives exist a pasted list may carry batch IDs. Rather than teach `parsePrivateKeys` more shapes, put the parsing in one place that returns both fields, and reduce `parsePrivateKeys` to a wrapper. That keeps PR #2's `GiftKitExport` and `RecoverFunds` working untouched.

This task also **removes the de-duplication PR #1 added**, per Global Constraints.

**Files:**
- Create: `src/lib/giftDriveList.ts`
- Create: `src/lib/giftDriveList.test.ts`
- Modify: `src/lib/walletUtils.ts`
- Modify: `src/lib/walletUtils.test.ts`

**Interfaces:**
- Consumes: `decodeGiftPayload`, `isValidPrivateKey` from `src/lib/giftPayload.ts` (Task 1).
- Produces:
  - `interface GiftDriveEntry { privateKey: string; batchId?: string }`
  - `parseGiftDriveList(input: string): GiftDriveEntry[]` — throws `Error` listing invalid entries; preserves input order; does **not** de-duplicate.
  - `parsePrivateKeys(input: string): string[]` keeps its existing signature and contract.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/giftDriveList.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseGiftDriveList } from './giftDriveList';
import { encodeGiftPayload } from './giftPayload';

const KEY_A = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const ADDRESS_A = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const KEY_B = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a';
const ADDRESS_B = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';
const BATCH_A = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

describe('parseGiftDriveList', () => {
    it('returns nothing for empty input', () => {
        expect(parseGiftDriveList('')).toEqual([]);
        expect(parseGiftDriveList('  \n ')).toEqual([]);
    });

    it('reads newline- and comma-separated bare keys', () => {
        expect(parseGiftDriveList(`${KEY_A}\n${KEY_B}`)).toEqual([
            { privateKey: KEY_A },
            { privateKey: KEY_B },
        ]);
        expect(parseGiftDriveList(`${KEY_A}, ${KEY_B}`)).toEqual([
            { privateKey: KEY_A },
            { privateKey: KEY_B },
        ]);
    });

    it('recovers the batch from a JSON payload line', () => {
        const payload = encodeGiftPayload({
            privateKey: KEY_A, address: ADDRESS_A, batchId: BATCH_A,
        });

        expect(parseGiftDriveList(payload)).toEqual([
            { privateKey: KEY_A, batchId: BATCH_A },
        ]);
    });

    it('recovers keys and batches from the tab-separated export', () => {
        const exported = [
            ['privateKey', 'address', 'batchId'].join('\t'),
            [KEY_A, ADDRESS_A, BATCH_A].join('\t'),
            [KEY_B, ADDRESS_B, ''].join('\t'),
        ].join('\n');

        expect(parseGiftDriveList(exported)).toEqual([
            { privateKey: KEY_A, batchId: BATCH_A },
            { privateKey: KEY_B },
        ]);
    });

    // A batch ID is 32 bytes of hex, and any 32-byte value in range is a valid
    // secp256k1 key -- so validation cannot tell one from a private key.
    // Never splitting it out as its own token is the only defence.
    it('never emits a batch ID as a key', () => {
        const exported = [KEY_A, ADDRESS_A, BATCH_A].join('\t');
        const keys = parseGiftDriveList(exported).map(e => e.privateKey);

        expect(keys).toEqual([KEY_A]);
        expect(keys).not.toContain(BATCH_A);
    });

    // giftKit/items.ts treats a duplicate as a hard error: two cards with the
    // same key means one gift handed out twice. Dropping it here would hide
    // that and silently produce one card fewer than asked for.
    it('keeps duplicates so the caller can reject them', () => {
        expect(parseGiftDriveList(`${KEY_A}\n${KEY_A}`)).toEqual([
            { privateKey: KEY_A },
            { privateKey: KEY_A },
        ]);
    });

    it('throws listing the invalid entries', () => {
        expect(() => parseGiftDriveList(`${KEY_A}\nnonsense`)).toThrow(/Invalid private keys/);
    });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `pnpm test src/lib/giftDriveList.test.ts`
Expected: FAIL — `Failed to resolve import './giftDriveList'`.

- [ ] **Step 3: Write the parser**

Create `src/lib/giftDriveList.ts`:

```ts
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
 * should surface, not something to quietly drop.
 */

export interface GiftDriveEntry {
    privateKey: string;
    batchId?: string;
}

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

        // A JSON payload is one whole line.
        if (line.startsWith('{')) {
            add(line, label);
            return;
        }

        // The Copy Codes export header.
        if (line.toLowerCase().startsWith('privatekey')) return;

        // A tab-delimited row is privateKey/address/batchId. Only the first
        // field is a key; the batch ID must never be treated as one.
        if (line.includes('\t')) {
            const [key, , batchId] = line.split('\t');
            const trimmedBatch = (batchId ?? '').trim();

            const decoded = decodeGiftPayload(key.trim());
            if (!decoded) {
                invalid.push(`${label}: ${key.trim().substring(0, 12)}...`);
                return;
            }

            const entry: GiftDriveEntry = { privateKey: decoded.privateKey };
            if (/^0x[0-9a-fA-F]{64}$/.test(trimmedBatch)) entry.batchId = trimmedBatch;
            entries.push(entry);
            return;
        }

        line
            .split(',')
            .map(token => token.trim())
            .filter(token => token.length > 0)
            .forEach(token => add(token, label));
    });

    if (invalid.length > 0) {
        throw new Error(`Invalid private keys found:\n${invalid.join('\n')}`);
    }

    return entries;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm test src/lib/giftDriveList.test.ts`
Expected: PASS.

- [ ] **Step 5: Reduce `parsePrivateKeys` to a wrapper**

In `src/lib/walletUtils.ts`, replace the whole `parsePrivateKeys` function (everything PR #1 wrote, including its de-duplication) with:

```ts
/**
 * Parse private keys from text input.
 *
 * Accepts every shape parseGiftDriveList does, discarding any batch IDs.
 * Callers that need the batch IDs should use parseGiftDriveList directly.
 *
 * Does not de-duplicate: giftKit/items.ts rejects duplicates by design.
 */
export function parsePrivateKeys(input: string): string[] {
    return parseGiftDriveList(input).map(entry => entry.privateKey);
}
```

Change the import line PR #1 added to:

```ts
import { isValidPrivateKey } from './giftPayload';
import { parseGiftDriveList } from './giftDriveList';

export { isValidPrivateKey };
```

- [ ] **Step 6: Update the `parsePrivateKeys` tests**

In `src/lib/walletUtils.test.ts`, delete the test named `deduplicates a wallet listed twice, so it is not drained twice` and add:

```ts
    it('does not deduplicate - giftKit rejects duplicates by design', () => {
        expect(parsePrivateKeys(`${KEY_A}\n${KEY_A}`)).toEqual([KEY_A, KEY_A]);
    });
```

Leave every other test in that file as is — they all still describe the wrapper's contract.

- [ ] **Step 7: Run the full suite**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/giftDriveList.ts src/lib/giftDriveList.test.ts src/lib/walletUtils.ts src/lib/walletUtils.test.ts
git commit -m "refactor: parse pasted lists in one place, and stop deduplicating keys"
```

---

### Task 3: Drop PR #1's print-sheet changes

PR #2 deletes `createQRCodeGridHTML`, `openQRCodeGrid` and `downloadQRCodeGrid` from `qrUtils.ts` — the handout kit replaces that whole path with raster PNGs it can verify. PR #1's batch-caption and HTML-escaping work lives entirely inside those functions, so it has no home. Remove it rather than leave a merge artifact.

**Files:**
- Modify: `src/lib/qrUtils.ts`
- Modify: `src/lib/giftPayload.test.ts`

- [ ] **Step 1: Confirm nothing still calls the deleted functions**

Run: `rg -n 'openQRCodeGrid|downloadQRCodeGrid|createQRCodeGridHTML' src/`
Expected: no matches outside `src/lib/qrUtils.ts`. If `GenerateCodes.tsx` still imports `openQRCodeGrid`, the rebase onto PR #2 was incomplete — stop and fix that first.

- [ ] **Step 2: Reduce `qrUtils.ts` to the preview helpers**

Replace the entire contents of `src/lib/qrUtils.ts` with:

```ts
import QRCode from 'qrcode';

/**
 * Generate QR code as SVG string, for the on-screen preview grid.
 *
 * The printable handout kit does not go through here: it needs raster PNGs it
 * can embed in a spreadsheet and a PDF, and decode back for verification. See
 * lib/giftKit.
 */
export async function generateQRCodeSVG(data: string, size: number = 128): Promise<string> {
    try {
        const svg = await QRCode.toString(data, {
            type: 'svg',
            width: size,
            // margin: 2,
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            }
        });
        return svg;
    } catch (error) {
        console.error('Error generating QR code:', error);
        throw new Error('Failed to generate QR code');
    }
}

/**
 * Generate multiple QR codes as SVG strings
 */
export async function generateMultipleQRCodes(
    dataArray: string[],
    size: number = 128
): Promise<string[]> {
    const promises = dataArray.map(data => generateQRCodeSVG(data, size));
    return Promise.all(promises);
}
```

This is byte-for-byte PR #2's version, so the file stops being a conflict.

- [ ] **Step 3: Run the suite and the build**

Run: `pnpm test && pnpm build`
Expected: PASS. The `QR encoding of a payload` tests in `giftPayload.test.ts` still pass — they use `generateQRCodeSVG`, which survives.

- [ ] **Step 4: Commit**

```bash
git add src/lib/qrUtils.ts
git commit -m "refactor: drop the print-sheet path the handout kit replaces"
```

---

### Task 4: Preflight wallet affordability before spending gas

The step can now run on a pasted list, for which there is no in-session "these were funded" signal. PR #1 gated the button on `hasFunded`, which cannot work here. Replace it with a read-only check across every wallet, so pasting fifty unfunded keys reports that up front instead of discovering it one failed transaction at a time.

**Files:**
- Modify: `src/lib/postageBatch.ts`
- Modify: `src/lib/postageBatch.test.ts`

**Interfaces:**
- Consumes: `BatchParams`, `getBatchCostPlur`, `formatBzz` (all existing in `src/lib/postageBatch.ts`).
- Produces:
  - `interface WalletAffordability { address: string; privateKey: string; bzzBalance: bigint; nativeBalance: bigint; costPlur: bigint; canAfford: boolean; reason?: string }`
  - `summariseAffordability(rows: WalletAffordability[]): { affordable: number; blocked: number; firstReason?: string }`
  - `preflightBatchWallets(entries: Array<{ privateKey: string }>, params: BatchParams, rpcUrl: string): Promise<WalletAffordability[]>` — structurally typed on purpose, so `postageBatch.ts` does not have to import from `giftDriveList.ts`. A `GiftDriveEntry[]` satisfies it.

- [ ] **Step 1: Write the failing test**

`preflightBatchWallets` needs a live RPC, so test the pure summariser rather than mocking ethers. Append to `src/lib/postageBatch.test.ts`:

```ts
describe('summariseAffordability', () => {
    const row = (over: Partial<WalletAffordability> = {}): WalletAffordability => ({
        address: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        privateKey: '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
        bzzBalance: 10n ** 16n,
        nativeBalance: 10n ** 18n,
        costPlur: 10n ** 14n,
        canAfford: true,
        ...over,
    });

    it('counts an all-clear run', () => {
        expect(summariseAffordability([row(), row()])).toEqual({ affordable: 2, blocked: 0 });
    });

    it('counts blocked wallets and surfaces the first reason', () => {
        const summary = summariseAffordability([
            row(),
            row({ canAfford: false, reason: 'holds 0.0 xBZZ, needs 0.01 xBZZ' }),
        ]);

        expect(summary.affordable).toBe(1);
        expect(summary.blocked).toBe(1);
        expect(summary.firstReason).toMatch(/needs 0.01 xBZZ/);
    });

    it('handles an empty run', () => {
        expect(summariseAffordability([])).toEqual({ affordable: 0, blocked: 0 });
    });
});
```

Add `WalletAffordability` and `summariseAffordability` to that file's imports from `./postageBatch`.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm test src/lib/postageBatch.test.ts`
Expected: FAIL — `summariseAffordability` is not exported.

- [ ] **Step 3: Implement both functions**

Append to `src/lib/postageBatch.ts`:

```ts
/** One wallet's ability to pay for its own gift drive. */
export interface WalletAffordability {
    address: string;
    privateKey: string;
    bzzBalance: bigint;
    nativeBalance: bigint;
    costPlur: bigint;
    canAfford: boolean;
    reason?: string;
}

/**
 * Read every wallet's balances before any transaction is sent.
 *
 * A pasted list carries no funding history, so this is the only way to tell an
 * operator that a run cannot succeed without charging them gas to find out.
 */
export async function preflightBatchWallets(
    entries: Array<{ privateKey: string }>,
    params: BatchParams,
    rpcUrl: string
): Promise<WalletAffordability[]> {
    const provider = new ethers.JsonRpcProvider(rpcUrl, CONFIG.CHAIN_ID);
    const bzz = new ethers.Contract(CONFIG.XBZZ_TOKEN_ADDRESS, ERC20_ABI, provider);
    const costPlur = getBatchCostPlur(params.depth, params.amountPerChunk);

    return Promise.all(
        entries.map(async entry => {
            const address = new ethers.Wallet(entry.privateKey).address;
            const [bzzBalance, nativeBalance] = await Promise.all([
                bzz.balanceOf(address) as Promise<bigint>,
                provider.getBalance(address),
            ]);

            let reason: string | undefined;
            if (bzzBalance < costPlur) {
                reason =
                    `holds ${formatBzz(bzzBalance)} xBZZ, needs ${formatBzz(costPlur)} xBZZ`;
            } else if (nativeBalance === 0n) {
                reason = 'has no xDAI for gas';
            }

            return {
                address,
                privateKey: entry.privateKey,
                bzzBalance,
                nativeBalance,
                costPlur,
                canAfford: reason === undefined,
                reason,
            };
        })
    );
}

/** Reduce a preflight to what the UI needs to decide whether to offer the run. */
export function summariseAffordability(rows: WalletAffordability[]): {
    affordable: number;
    blocked: number;
    firstReason?: string;
} {
    const blockedRows = rows.filter(row => !row.canAfford);
    const summary: { affordable: number; blocked: number; firstReason?: string } = {
        affordable: rows.length - blockedRows.length,
        blocked: blockedRows.length,
    };

    const firstReason = blockedRows.find(row => row.reason)?.reason;
    if (firstReason) summary.firstReason = firstReason;

    return summary;
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm test src/lib/postageBatch.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/postageBatch.ts src/lib/postageBatch.test.ts
git commit -m "feat: preflight wallet balances before creating gift drives"
```

---

### Task 5: The `GiftDriveStep` component

Everything PR #1 put inside the generate form moves here, and gains a source toggle. Deliberately mirrors `GiftKitExport`'s shape — same `Source` type, same button pair, same textarea — so the three steps read as one flow.

Settings move with it, into their own `localStorage` key. That is what lets `WalletFormData` go back to three fields and removes the batch-cost coupling from the generate form.

**Files:**
- Create: `src/components/GiftDriveStep.tsx`
- Modify: `src/lib/types.ts`

**Interfaces:**
- Consumes: `parseGiftDriveList` / `GiftDriveEntry` (Task 2); `preflightBatchWallets`, `summariseAffordability`, `WalletAffordability` (Task 4); and the existing `createBatchesForWallets`, `readChainBatchLimits`, `validateBatchParams`, `getBatchCostPlur`, `getBatchTtlSeconds`, `getEffectiveCapacityBytes`, `formatBytes`, `formatBzz`, `formatTtl`, `BatchParams`, `BatchProgress`, `BatchResult`, `ChainBatchLimits` from `src/lib/postageBatch.ts`.
- Produces: `GiftDriveStep({ giftCodes, onSessionDrivesCreated }: GiftDriveStepProps)`, where
  `interface GiftDriveStepProps { giftCodes: GiftCode[]; onSessionDrivesCreated: (results: BatchResult[], params: BatchParams) => void }`. The params come along because the QR grid displays depth/encryption/immutability; they are deliberately not in the QR payload.

- [ ] **Step 1: Shrink `WalletFormData` back to the funding fields**

In `src/lib/types.ts`, replace the `WalletFormData` interface with:

```ts
/** Operator-supplied settings for generating and funding gift codes. */
export interface WalletFormData {
  xdaiAmount: number;
  xbzzAmount: number;
  walletCount: number;
}
```

Leave `GiftCode` exactly as it is — its gift-drive fields are still how a drive reaches the QR grid and the kit.

- [ ] **Step 2: Write the component**

Create `src/components/GiftDriveStep.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react';
import { ethers } from 'ethers';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CONFIG } from '../config';
import { getGlobalRpcUrl } from './WalletBalanceCard';
import { parseGiftDriveList } from '../lib/giftDriveList';
import type { GiftDriveEntry } from '../lib/giftDriveList';
import {
  createBatchesForWallets,
  formatBytes,
  formatBzz,
  formatTtl,
  getBatchCostPlur,
  getBatchTtlSeconds,
  getEffectiveCapacityBytes,
  preflightBatchWallets,
  readChainBatchLimits,
  summariseAffordability,
  validateBatchParams,
} from '../lib/postageBatch';
import type {
  BatchParams,
  BatchProgress,
  BatchResult,
  ChainBatchLimits,
  WalletAffordability,
} from '../lib/postageBatch';
import type { GiftCode } from '../lib/types';

const SETTINGS_STORAGE_KEY = 'swarm-bzz-gift-code-dapp:gift-drive-settings';

type Source = 'session' | 'paste';

interface GiftDriveSettings {
  depth: number;
  amount: string;
  encrypted: boolean;
  immutable: boolean;
}

interface GiftDriveStepProps {
  giftCodes: GiftCode[];
  onSessionDrivesCreated: (results: BatchResult[], params: BatchParams) => void;
}

function defaultSettings(): GiftDriveSettings {
  return {
    depth: CONFIG.DEFAULT_BATCH_DEPTH,
    amount: CONFIG.DEFAULT_BATCH_AMOUNT,
    encrypted: CONFIG.DEFAULT_BATCH_ENCRYPTED,
    immutable: CONFIG.DEFAULT_BATCH_IMMUTABLE,
  };
}

function loadSettings(): GiftDriveSettings {
  const defaults = defaultSettings();

  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!stored) return defaults;

    const parsed = JSON.parse(stored) as Partial<GiftDriveSettings>;
    return {
      depth: typeof parsed.depth === 'number' ? parsed.depth : defaults.depth,
      amount: typeof parsed.amount === 'string' ? parsed.amount : defaults.amount,
      encrypted:
        typeof parsed.encrypted === 'boolean' ? parsed.encrypted : defaults.encrypted,
      immutable:
        typeof parsed.immutable === 'boolean' ? parsed.immutable : defaults.immutable,
    };
  } catch {
    return defaults;
  }
}

/** The per-chunk amount routinely exceeds Number.MAX_SAFE_INTEGER. */
function parseAmount(value: string): bigint | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return BigInt(trimmed);
}

export function GiftDriveStep({ giftCodes, onSessionDrivesCreated }: GiftDriveStepProps) {
  const [settings, setSettings] = useState<GiftDriveSettings>(loadSettings);
  const [source, setSource] = useState<Source>(giftCodes.length > 0 ? 'session' : 'paste');
  const [pasted, setPasted] = useState('');
  const [limits, setLimits] = useState<ChainBatchLimits | null>(null);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [preflight, setPreflight] = useState<WalletAffordability[] | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [results, setResults] = useState<BatchResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isRunning = progress !== null;

  useEffect(() => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  // The contract's minimum tracks the storage price, so both the built-in
  // default and a value saved in an earlier session can fall below it. Raise a
  // stale value rather than leaving a form that can only fail. Never lowers one
  // the operator deliberately set higher.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const provider = new ethers.JsonRpcProvider(getGlobalRpcUrl(), CONFIG.CHAIN_ID);
        const read = await readChainBatchLimits(provider);
        if (cancelled) return;

        setLimits(read);
        setSettings(prev => {
          const current = parseAmount(prev.amount);
          if (current !== null && current >= read.minimumInitialBalancePerChunk) return prev;
          return { ...prev, amount: read.minimumInitialBalancePerChunk.toString() };
        });
      } catch (err) {
        console.error('Failed to read postage batch limits:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const amountPlur = useMemo(() => parseAmount(settings.amount), [settings.amount]);

  const params = useMemo<BatchParams | null>(() => {
    if (amountPlur === null) return null;
    return {
      depth: settings.depth,
      amountPerChunk: amountPlur,
      encrypted: settings.encrypted,
      immutable: settings.immutable,
    };
  }, [amountPlur, settings.depth, settings.encrypted, settings.immutable]);

  // Parsing the textarea can throw; the step must still render.
  const parsed = useMemo<{ entries: GiftDriveEntry[]; error: string | null }>(() => {
    if (source === 'session') {
      return { entries: giftCodes.map(c => ({ privateKey: c.privateKey })), error: null };
    }
    if (!pasted.trim()) return { entries: [], error: null };
    try {
      return { entries: parseGiftDriveList(pasted), error: null };
    } catch (err) {
      return {
        entries: [],
        error: err instanceof Error ? err.message : 'Could not read that list',
      };
    }
  }, [source, giftCodes, pasted]);

  const settingsErrors = params
    ? validateBatchParams(params, limits)
    : ['Amount must be a whole number of PLUR'];

  const readout = useMemo(() => {
    if (!params) return null;
    const costPlur = getBatchCostPlur(params.depth, params.amountPerChunk);
    return {
      costPlur,
      totalPlur: costPlur * BigInt(parsed.entries.length),
      capacityBytes: getEffectiveCapacityBytes(params.depth, params.encrypted),
      ttlSeconds: limits ? getBatchTtlSeconds(params.amountPerChunk, limits.lastPrice) : 0,
    };
  }, [params, limits, parsed.entries.length]);

  const canRun =
    !isRunning &&
    !isChecking &&
    parsed.entries.length > 0 &&
    parsed.error === null &&
    settingsErrors.length === 0;

  function updateSetting<K extends keyof GiftDriveSettings>(key: K, value: GiftDriveSettings[K]) {
    setSettings(prev => ({ ...prev, [key]: value }));
    setPreflight(null);
  }

  async function handleCheck() {
    if (!params) return;
    setError(null);
    setNotice(null);
    setIsChecking(true);

    try {
      const rows = await preflightBatchWallets(parsed.entries, params, getGlobalRpcUrl());
      setPreflight(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read wallet balances');
    } finally {
      setIsChecking(false);
    }
  }

  async function handleCreate() {
    if (!params) return;
    setError(null);
    setNotice(null);
    setResults(null);
    setProgress({ current: 0, total: parsed.entries.length, processing: '' });

    try {
      const rpcUrl = getGlobalRpcUrl();

      // Re-read the limits: the price moves, and a stale minimum would only
      // show up as a revert part-way through a paid run.
      const provider = new ethers.JsonRpcProvider(rpcUrl, CONFIG.CHAIN_ID);
      const read = await readChainBatchLimits(provider);
      setLimits(read);

      const invalid = validateBatchParams(params, read);
      if (invalid.length > 0) {
        throw new Error(`Invalid gift drive settings: ${invalid.join('; ')}`);
      }

      const rows = await preflightBatchWallets(parsed.entries, params, rpcUrl);
      setPreflight(rows);

      const summary = summariseAffordability(rows);
      if (summary.affordable === 0) {
        throw new Error(
          `No wallet can pay for a gift drive. First problem: ${summary.firstReason}`
        );
      }

      const payable = rows.filter(row => row.canAfford);
      if (summary.blocked > 0) {
        setNotice(
          `Skipping ${summary.blocked} wallet${summary.blocked === 1 ? '' : 's'} that ` +
          `cannot pay. First problem: ${summary.firstReason}`
        );
      }

      const created = await createBatchesForWallets(
        payable.map(row => ({ privateKey: row.privateKey, address: row.address })),
        params,
        rpcUrl,
        setProgress
      );

      setResults(created);
      if (source === 'session') onSessionDrivesCreated(created);

      const ok = created.filter(r => r.batchId).length;
      const failed = created.length - ok;
      if (failed > 0) {
        setError(
          `${ok} gift drive${ok === 1 ? '' : 's'} created, ${failed} failed. ` +
          `See the list below.`
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create gift drives');
    } finally {
      setProgress(null);
    }
  }

  function handleCopyResults() {
    if (!results) return;
    const text = [
      ['privateKey', 'address', 'batchId'].join('\t'),
      ...results.map(r => [r.privateKey, r.address, r.batchId ?? ''].join('\t')),
    ].join('\n');
    navigator.clipboard.writeText(text);
    setNotice('Gift drives copied to clipboard (private key, address, batch ID)');
  }

  const preflightSummary = preflight ? summariseAffordability(preflight) : null;

  return (
    <div className="space-y-4">
      <div className="font-semibold text-lg">Gift drives</div>
      <p className="text-sm text-muted-foreground">
        Attach Swarm storage to each gift code. Every wallet buys and owns its own
        postage batch, so the recipient's Bee node can stamp with it as soon as they
        import the key. Run this on codes from this session, or paste a list from an
        earlier one.
      </p>

      <div className="flex gap-2">
        <Button
          type="button"
          variant={source === 'session' ? 'default' : 'secondary'}
          onClick={() => { setSource('session'); setPreflight(null); }}
          disabled={isRunning || giftCodes.length === 0}
        >
          Codes from this session{giftCodes.length > 0 ? ` (${giftCodes.length})` : ''}
        </Button>
        <Button
          type="button"
          variant={source === 'paste' ? 'default' : 'secondary'}
          onClick={() => { setSource('paste'); setPreflight(null); }}
          disabled={isRunning}
        >
          Paste a key list
        </Button>
      </div>

      {source === 'paste' && (
        <div className="space-y-2">
          <Label htmlFor="driveKeys">Gift codes (private keys)</Label>
          <Textarea
            id="driveKeys"
            value={pasted}
            onChange={e => { setPasted(e.target.value); setPreflight(null); }}
            placeholder="Enter private keys separated by commas or newlines"
            rows={8}
            disabled={isRunning}
          />
          {parsed.error && (
            <p className="text-sm text-red-700">{parsed.error}</p>
          )}
          {!parsed.error && parsed.entries.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {parsed.entries.length} key{parsed.entries.length === 1 ? '' : 's'} read
            </p>
          )}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="driveDepth">Depth</Label>
          <Input
            id="driveDepth"
            type="number"
            min={CONFIG.MIN_BATCH_DEPTH}
            max={CONFIG.MAX_BATCH_DEPTH}
            value={settings.depth}
            onChange={e => updateSetting('depth', Number(e.target.value))}
            disabled={isRunning}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="driveAmount">Amount per chunk (PLUR)</Label>
          <Input
            id="driveAmount"
            type="text"
            inputMode="numeric"
            value={settings.amount}
            onChange={e => updateSetting('amount', e.target.value)}
            disabled={isRunning}
          />
        </div>
      </div>

      {limits && (
        <p className="text-xs text-muted-foreground">
          Contract minimum is {limits.minimumInitialBalancePerChunk.toString()} PLUR
          (about 24 hours at the current price of {limits.lastPrice.toString()} PLUR per
          chunk per block).
        </p>
      )}

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <input
            id="driveEncrypted"
            type="checkbox"
            className="h-4 w-4"
            checked={settings.encrypted}
            onChange={e => updateSetting('encrypted', e.target.checked)}
            disabled={isRunning}
          />
          <Label htmlFor="driveEncrypted" className="font-normal">
            Size for encrypted uploads
          </Label>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="driveImmutable"
            type="checkbox"
            className="h-4 w-4"
            checked={settings.immutable}
            onChange={e => updateSetting('immutable', e.target.checked)}
            disabled={isRunning}
          />
          <Label htmlFor="driveImmutable" className="font-normal">
            Immutable (rejects overwrites once full)
          </Label>
        </div>

        <p className="text-xs text-muted-foreground">Erasure coding: None (fixed)</p>
      </div>

      {readout && (
        <div className="space-y-1 rounded border border-slate-200 bg-slate-50 p-3 text-sm">
          <div className="font-medium">Per gift drive</div>
          <div>Effective capacity: {formatBytes(readout.capacityBytes)}</div>
          <div>
            Estimated lifetime: {limits ? formatTtl(readout.ttlSeconds) : 'reading price...'}
          </div>
          <div>Cost: {formatBzz(readout.costPlur)} xBZZ</div>
          <div className="pt-1 font-medium">
            Total for {parsed.entries.length} wallet
            {parsed.entries.length === 1 ? '' : 's'}: {formatBzz(readout.totalPlur)} xBZZ
          </div>
        </div>
      )}

      {settingsErrors.length > 0 && (
        <Alert>
          <AlertTitle>Gift drive settings need attention</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {settingsErrors.map(message => <li key={message}>{message}</li>)}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={handleCheck} disabled={!canRun}>
          {isChecking ? 'Checking...' : 'Check wallets'}
        </Button>
        <Button type="button" className="flex-1" onClick={handleCreate} disabled={!canRun}>
          {isRunning
            ? 'Creating gift drives...'
            : `Create ${parsed.entries.length || ''} gift drive${parsed.entries.length === 1 ? '' : 's'}`}
        </Button>
      </div>

      {preflightSummary && !isRunning && (
        <Alert
          className={
            preflightSummary.blocked === 0
              ? 'border-green-500 bg-green-50 text-green-800'
              : 'border-amber-500 bg-amber-50 text-amber-900'
          }
        >
          <AlertTitle>
            {preflightSummary.affordable} of {preflight?.length} wallet
            {preflight?.length === 1 ? '' : 's'} can pay
          </AlertTitle>
          <AlertDescription>
            {preflightSummary.blocked === 0
              ? 'Every wallet holds enough xBZZ and has gas.'
              : `First problem: ${preflightSummary.firstReason}`}
          </AlertDescription>
        </Alert>
      )}

      {progress && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Creating gift drive {progress.current} of {progress.total}</span>
            <span className="font-mono text-xs">{progress.processing}</span>
          </div>
          <div className="h-2 w-full rounded bg-slate-200">
            <div
              className="h-2 rounded bg-green-600 transition-all"
              style={{
                width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%`,
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Two transactions per wallet (approve, then create). Leave this tab open.
          </p>
        </div>
      )}

      {notice && (
        <Alert className="border-blue-500 bg-blue-50 text-blue-800">
          <AlertTitle>Note</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert>
          <AlertTitle>Gift drives</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {results && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="font-medium">
              {results.filter(r => r.batchId).length} gift drive
              {results.filter(r => r.batchId).length === 1 ? '' : 's'} created
            </div>
            <Button type="button" variant="secondary" onClick={handleCopyResults}>
              Copy gift drives
            </Button>
          </div>
          <div className="divide-y rounded border border-slate-200">
            {results.map(result => (
              <div key={result.address} className="space-y-1 p-2 text-xs">
                <div className="font-mono">{result.address}</div>
                {result.batchId && (
                  <div className="break-all font-mono text-green-800">{result.batchId}</div>
                )}
                {result.error && <div className="text-red-700">{result.error}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm build`
Expected: PASS. If `tsc` reports `WalletFormData` errors in `GenerateCodes.tsx`, that is Task 6's work — carry on to it before committing.

- [ ] **Step 4: Commit**

```bash
git add src/components/GiftDriveStep.tsx src/lib/types.ts
git commit -m "feat: add the gift drive step, from session codes or a pasted list"
```

---

### Task 6: Wire the step into the page and strip the old batch UI

**Files:**
- Modify: `src/pages/GenerateCodes.tsx`

- [ ] **Step 1: Remove every batch concern from the page**

Delete from `src/pages/GenerateCodes.tsx`:
- the `batchDepth` / `batchAmount` / `batchEncrypted` / `batchImmutable` entries in `getDefaultFormData` and `loadFormFromStorage`
- `parseBatchAmount`
- the `isCreatingBatches`, `batchProgress`, `hasFunded` and `chainLimits` state
- the `readChainBatchLimits` effect
- the `batchAmountPlur`, `batchParams`, `batchSummary` memos and `canCreateBatches`
- `handleCreateBatches`
- the entire `Postage batch` fieldset and its readout/alerts in the form
- the `Create Postage Batches` button, the `!hasFunded` hint and the batch progress block
- the `setHasFunded` calls in `handleSubmit` and `handleFundWallets`
- the `type === 'checkbox'` branch in `handleChange` (no checkboxes remain on this form)
- every now-unused import from `../lib/postageBatch`, plus `useMemo` and `getGlobalRpcUrl` if nothing else uses them

Keep: `handleCopyCodes` (its tab-separated form is what feeds the paste boxes), the `QRCodeGrid` batch display, and everything about generating and funding.

- [ ] **Step 2: Render the step**

Add the import:

```tsx
import { GiftDriveStep } from '../components/GiftDriveStep';
import type { BatchResult } from '../lib/postageBatch';
```

Add the merge handler next to `handleCopyCodes`:

```tsx
  function handleSessionDrivesCreated(results: BatchResult[]) {
    const byAddress = new Map(results.map(r => [r.address.toLowerCase(), r]));

    setGiftCodes(prev =>
      prev.map(code => {
        const result = byAddress.get(code.address.toLowerCase());
        if (!result) return code;

        return {
          ...code,
          batchId: result.batchId,
          batchError: result.error,
        };
      })
    );
  }
```

`batchDepth`, `encrypted` and `immutable` are no longer copied onto the code: they are not in the QR payload any more, and the kit's xlsx is where they belong.

Then render the step between the results card and the handout kit card:

```tsx
      <Card className="mt-8">
        <CardContent className="p-6">
          <GiftDriveStep
            giftCodes={giftCodes}
            onSessionDrivesCreated={handleSessionDrivesCreated}
          />
        </CardContent>
      </Card>
```

- [ ] **Step 3: Verify the whole flow statically**

Run: `pnpm test && pnpm build && pnpm lint`
Expected: tests and build PASS; lint shows only `main`'s pre-existing errors.

- [ ] **Step 4: Confirm the page renders and the three steps appear in order**

Run: `pnpm dev`, open the Generate tab, and check: the generate form has no batch fields; a `Gift drives` card sits below the generated-codes card; a `Handout kit` card sits below that. With no wallet connected, `Paste a key list` is preselected on both.

- [ ] **Step 5: Commit**

```bash
git add src/pages/GenerateCodes.tsx
git commit -m "refactor: make gift drives their own step on the generate page"
```

---

# Phase B — Carry gift drives through the handout kit

**Do not start until PR #2 is merged into `main` and this branch is rebased onto it.**

### Task 7: The kit knows about gift drives

**Files:**
- Create: `src/lib/giftKit/payload.ts`
- Modify: `src/lib/giftKit/types.ts`, `src/lib/giftKit/items.ts`
- Modify: `src/lib/giftKit/items.test.ts`

**Interfaces:**
- Consumes: `encodeGiftPayload` from `src/lib/giftPayload.ts` (Task 1).
- Produces:
  - `GiftKitItem` gains `batchId?: string`
  - `GiftKitOptions` gains `driveByKey?: ReadonlyMap<string, string>` (lower-cased private key → batch ID)
  - `buildItems(keys: string[], driveByKey?: ReadonlyMap<string, string>): GiftKitItem[]`
  - `itemPayload(item: GiftKitItem): string`

A `ReadonlyMap` passed alongside the existing `keys: string[]` keeps `buildItems` and `buildGiftKit` backwards compatible, so PR #2's existing tests and call sites need no signature churn.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/giftKit/items.test.ts`:

```ts
  it('attaches a batch id to the matching key', () => {
    const drives = new Map([[KEY_A.toLowerCase(), BATCH_A]]);
    const items = buildItems([KEY_A, KEY_B], drives);

    expect(items[0].batchId).toBe(BATCH_A);
    expect(items[1].batchId).toBeUndefined();
  });

  it('matches keys case-insensitively', () => {
    const drives = new Map([[KEY_A.toLowerCase(), BATCH_A]]);
    expect(buildItems([KEY_A.toUpperCase().replace('0X', '0x')], drives)[0].batchId)
      .toBe(BATCH_A);
  });
```

Declare `KEY_A`, `KEY_B` and `BATCH_A` at the top of that file if it does not already have suitable constants — reuse whatever fixtures it defines. Then create `src/lib/giftKit/payload.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { itemPayload } from './payload';
import type { GiftKitItem } from './types';

const PK = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const ADDRESS = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const BATCH = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

const item = (over: Partial<GiftKitItem> = {}): GiftKitItem => ({
  num: 1, address: ADDRESS, privateKey: PK, ...over,
});

describe('itemPayload', () => {
  // A plain gift code must stay a bare key so a wallet app can scan it and
  // import directly. Only a gift drive needs the structured form.
  it('is the bare key with no gift drive', () => {
    expect(itemPayload(item())).toBe(PK);
  });

  it('carries key and batch once there is a gift drive', () => {
    expect(JSON.parse(itemPayload(item({ batchId: BATCH })))).toEqual({
      v: 1, pk: PK, batch: BATCH,
    });
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `pnpm test src/lib/giftKit/`
Expected: FAIL — `./payload` does not resolve; `buildItems` takes one argument.

- [ ] **Step 3: Extend the types**

In `src/lib/giftKit/types.ts`, add `batchId` to `GiftKitItem` and `driveByKey` to `GiftKitOptions`:

```ts
/** One key in a batch, numbered from 1 so card #N is always sheet row N. */
export interface GiftKitItem {
  num: number;
  address: string;
  privateKey: string;
  /** The postage batch this key owns - its gift drive - when it has one. */
  batchId?: string;
}
```

```ts
export interface GiftKitOptions {
  name: string;
  /** Lower-cased private key to batch id, for keys that have a gift drive. */
  driveByKey?: ReadonlyMap<string, string>;
}
```

- [ ] **Step 4: Write the payload helper**

Create `src/lib/giftKit/payload.ts`:

```ts
import { encodeGiftPayload } from '../giftPayload';
import type { GiftKitItem } from './types';

/**
 * The one place the kit turns an item into QR text.
 *
 * Every artifact and the verification pass go through here, so the PNG, the
 * spreadsheet and the printed card can never disagree about what a QR holds.
 */
export function itemPayload(item: GiftKitItem): string {
  return encodeGiftPayload({
    privateKey: item.privateKey,
    address: item.address,
    batchId: item.batchId,
  });
}
```

- [ ] **Step 5: Attach drives in `buildItems`**

In `src/lib/giftKit/items.ts`, change the signature and the returned object:

```ts
export function buildItems(
  keys: string[],
  driveByKey?: ReadonlyMap<string, string>,
): GiftKitItem[] {
```

and replace the `return` inside the `map` with:

```ts
    const item: GiftKitItem = {
      num: i + 1,
      address: new ethers.Wallet(privateKey).address,
      privateKey,
    };

    const batchId = driveByKey?.get(lower);
    if (batchId) item.batchId = batchId;

    return item;
```

Leave the existing duplicate and format checks exactly as they are.

- [ ] **Step 6: Run the tests and confirm they pass**

Run: `pnpm test src/lib/giftKit/`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/giftKit/types.ts src/lib/giftKit/items.ts src/lib/giftKit/items.test.ts src/lib/giftKit/payload.ts src/lib/giftKit/payload.test.ts
git commit -m "feat: teach the handout kit about gift drives"
```

---

### Task 8: Every artifact encodes the payload, and verification checks it

**Files:**
- Modify: `src/lib/giftKit/buildGiftKit.ts`, `src/lib/giftKit/verify.ts`
- Modify: `src/lib/giftKit/qrRoundTrip.test.ts`, `src/lib/giftKit/buildGiftKit.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/giftKit/qrRoundTrip.test.ts` (reuse that file's existing fixtures and its rasteriser/decode helpers):

```ts
  it('a gift drive QR decodes back to key and batch, and still prints legibly', async () => {
    const drives = new Map([[KEY_A.toLowerCase(), BATCH_A]]);
    const items = buildItems([KEY_A], drives);
    const version = maxQrVersion(items.map(itemPayload));
    const qr = renderQr(itemPayload(items[0]), version);

    const decoded = await decodeBytes(qr.bytes);
    expect(decoded).toHaveLength(1);
    expect(JSON.parse(decoded[0])).toEqual({ v: 1, pk: KEY_A, batch: BATCH_A });

    // Assert the printed pitch, never a module count: node-qrcode's segment
    // optimiser mixes numeric and byte runs, so the version moves with the hex
    // content of the key.
    const layout = computeCardLayout(4, 5);
    expect(mmPerModule(layout.qrMm, qr.moduleCount))
      .toBeGreaterThanOrEqual(MM_PER_MODULE_FLOOR);
  });
```

Import `itemPayload`, `buildItems`, `computeCardLayout`, `mmPerModule` and `MM_PER_MODULE_FLOOR` as needed.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm test src/lib/giftKit/qrRoundTrip.test.ts`
Expected: FAIL — `itemPayload` is not imported/used by the kit yet.

- [ ] **Step 3: Encode the payload in `buildGiftKit`**

In `src/lib/giftKit/buildGiftKit.ts`, add the import:

```ts
import { itemPayload } from './payload';
```

Pass the drive map into `buildItems`:

```ts
  const items = buildItems(keys, options.driveByKey);
```

Then replace the two places QR text is produced:

```ts
  const version = maxQrVersion(items.map(itemPayload));
```

```ts
    qrs.push(renderQr(itemPayload(item), version));
```

and the corruption seam:

```ts
    qrs[0] = renderQr(itemPayload(items[items.length - 1]), version);
```

- [ ] **Step 4: Compare against the payload in `verify.ts`**

In `src/lib/giftKit/verify.ts`, add:

```ts
import { itemPayload } from './payload';
```

Replace the three comparisons:

```ts
    const got = await decodeBytes(qrs[i].bytes);
    if (got.length !== 1 || got[0] !== itemPayload(item)) {
```

```ts
      const got = await decodeBytes(image);
      if (got.length !== 1 || got[0] !== itemPayload(item)) {
```

```ts
    const expected = items.map(itemPayload);
```

Leave the `PNG ${item.num}` / `xlsx row` / `PDF` problem messages as they are — they describe the location, not the payload shape.

- [ ] **Step 5: Run the whole kit suite**

Run: `pnpm test src/lib/giftKit/`
Expected: PASS, including PR #2's existing bare-key tests — with no drive map, `itemPayload` returns the bare key, so their expectations are unchanged.

- [ ] **Step 6: Add the end-to-end gift drive case**

Append to `src/lib/giftKit/buildGiftKit.test.ts`, following the shape of the existing happy-path test in that file (including its `__rasterise` seam):

```ts
  it('builds and verifies a kit whose codes have gift drives', async () => {
    const drives = new Map(KEYS.map((k, i) => [k.toLowerCase(), BATCHES[i]]));
    const { report } = await buildGiftKit(KEYS, { name: 'Drives', driveByKey: drives }, undefined);

    expect(report.count).toBe(KEYS.length);
    expect(report.mmPerModule).toBeGreaterThanOrEqual(MM_PER_MODULE_FLOOR);
  });
```

Define `BATCHES` as one distinct 32-byte hex string per key in `KEYS`, and pass the same `__rasterise` option the neighbouring test uses.

- [ ] **Step 7: Run and commit**

Run: `pnpm test && pnpm build`
Expected: PASS.

```bash
git add src/lib/giftKit/buildGiftKit.ts src/lib/giftKit/verify.ts src/lib/giftKit/qrRoundTrip.test.ts src/lib/giftKit/buildGiftKit.test.ts
git commit -m "feat: encode and verify gift drives in every kit artifact"
```

---

### Task 9: The tracking sheet records the gift drive

**Files:**
- Modify: `src/lib/giftKit/xlsxSpec.ts`, `src/lib/giftKit/xlsxWrite.ts`, `src/lib/giftKit/xlsxRead.ts`, `src/lib/giftKit/verify.ts`
- Modify: `src/lib/giftKit/xlsx.test.ts`

The column is **appended** rather than inserted next to the key: `Used` stays column 5 and the QR image anchor stays column 3, so nothing about PR #2's verified image-anchor logic moves.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/giftKit/xlsx.test.ts`, following its existing `buildXlsx` + `readXlsx` pattern:

```ts
  it('records the gift drive, and leaves it blank without one', async () => {
    const drives = new Map([[KEY_A.toLowerCase(), BATCH_A]]);
    const items = buildItems([KEY_A, KEY_B], drives);
    const version = maxQrVersion(items.map(itemPayload));
    const qrs = items.map(i => renderQr(itemPayload(i), version));

    const sheet = await readXlsx(await buildXlsx(items, qrs, 'Drives'));

    expect(sheet.rowValues[0].batchId).toBe(BATCH_A);
    expect(sheet.rowValues[1].batchId ?? '').toBe('');
  });
```

Also update that file's header assertion to expect the new column — search it with `rg -n 'HEADERS' src/lib/giftKit/xlsx.test.ts`.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm test src/lib/giftKit/xlsx.test.ts`
Expected: FAIL — `batchId` is not read back.

- [ ] **Step 3: Add the column to the spec**

In `src/lib/giftKit/xlsxSpec.ts`:

```ts
export const HEADERS = ['#', 'Public address', 'Private key', 'QR code', 'Used', 'Gift drive'] as const;
export const COLUMN_WIDTHS = [5, 46, 70, 22, 9, 70];
```

- [ ] **Step 4: Write it**

In `src/lib/giftKit/xlsxWrite.ts`, after the `row.getCell(5)` block:

```ts
    // Column 6, appended rather than inserted, so Used stays at 5 and the QR
    // image anchor stays at column 3.
    row.getCell(6).value = item.batchId ?? '';
    row.getCell(6).font = { name: 'Menlo', size: 10 };
    row.getCell(6).alignment = { vertical: 'middle' };
```

- [ ] **Step 5: Read it back**

In `src/lib/giftKit/xlsxRead.ts`, add to the pushed object:

```ts
      batchId: row.getCell(6).value,
```

- [ ] **Step 6: Verify it against the item**

In `src/lib/giftKit/verify.ts`, inside the per-row loop, after the existing address/key check:

```ts
    const expectedDrive = item.batchId ?? '';
    const gotDrive = values?.batchId == null ? '' : String(values.batchId);
    if (gotDrive !== expectedDrive) {
      problems.push({ where: `xlsx row ${row}`, detail: 'gift drive mismatch' });
    }
```

- [ ] **Step 7: Run and commit**

Run: `pnpm test && pnpm build`
Expected: PASS.

```bash
git add src/lib/giftKit/xlsxSpec.ts src/lib/giftKit/xlsxWrite.ts src/lib/giftKit/xlsxRead.ts src/lib/giftKit/verify.ts src/lib/giftKit/xlsx.test.ts
git commit -m "feat: record the gift drive in the tracking sheet"
```

---

### Task 10: The kit export takes gift drives

Closes the flow: a kit can be built from this session's drives, or from a pasted export of drives created in an earlier session.

**Files:**
- Modify: `src/components/GiftKitExport.tsx`

- [ ] **Step 1: Source the drives**

In `src/components/GiftKitExport.tsx`, replace the `parsePrivateKeys` import with:

```ts
import { parseGiftDriveList } from '../lib/giftDriveList';
import type { GiftDriveEntry } from '../lib/giftDriveList';
```

and fix the `GiftCode` import, which PR #1 moved:

```ts
import type { GiftCode } from '../lib/types';
```

Then replace the `const keys = ...` block in `handleExport` with:

```ts
      const entries: GiftDriveEntry[] =
        source === 'session'
          ? giftCodes.map(c => ({
              privateKey: c.privateKey,
              ...(c.batchId ? { batchId: c.batchId } : {}),
            }))
          : parseGiftDriveList(pasted);

      if (entries.length === 0) throw new Error('No gift codes to export');

      const keys = entries.map(e => e.privateKey);
      const driveByKey = new Map(
        entries
          .filter((e): e is GiftDriveEntry & { batchId: string } => Boolean(e.batchId))
          .map(e => [e.privateKey.toLowerCase(), e.batchId]),
      );
```

and pass the map through:

```ts
      const { zipBytes, report: built } = await buildGiftKit(
        keys,
        { name: name.trim() || DEFAULT_NAME, driveByKey },
        setProgress,
      );
```

- [ ] **Step 2: Tell the operator what they are about to get**

Below the existing description paragraph, add:

```tsx
      <p className="text-sm text-muted-foreground">
        Codes with a gift drive get a QR carrying both the key and the drive; codes
        without one keep a plain key QR that any wallet can scan.
      </p>
```

- [ ] **Step 3: Fix the paste-mode key count**

`keyCount` is currently `source === 'session' ? giftCodes.length : 0`, which reads as zero in paste mode. Replace it with:

```ts
  const pastedCount = useMemo(() => {
    if (!pasted.trim()) return 0;
    try {
      return parseGiftDriveList(pasted).length;
    } catch {
      return 0;
    }
  }, [pasted]);

  const keyCount = source === 'session' ? giftCodes.length : pastedCount;
```

Import `useMemo`, and change the export button's `disabled` to `isRunning || keyCount === 0` so paste mode is gated on actually having read some keys.

- [ ] **Step 4: Verify statically**

Run: `pnpm test && pnpm build && pnpm lint`
Expected: tests and build PASS; no new lint errors.

- [ ] **Step 5: Verify the whole flow in the browser**

Run `pnpm dev` and, without connecting a wallet, on the Generate tab:
1. Paste two throwaway keys into **Gift drives** → `Paste a key list`. The readout shows capacity, lifetime and total cost, and `Check wallets` reports both wallets cannot pay. Do not click Create.
2. Paste the same two keys into **Handout kit** → `Paste a key list`, and download. Open the zip: two QR PNGs, an xlsx with an empty `Gift drive` column, and a card sheet.
3. Paste a tab-separated `privateKey<TAB>address<TAB>batchId` row (header included) into the kit's paste box, download, and confirm the xlsx `Gift drive` column carries the batch ID and the QR decodes to JSON. A QR decoder on the PNG should show `{"v":1,"pk":"0x…","batch":"0x…"}`.

- [ ] **Step 6: Commit**

```bash
git add src/components/GiftKitExport.tsx
git commit -m "feat: build the handout kit from gift drives"
```

---

## Verification

**Automated.** `pnpm test` (whole suite: PR #2's ~68 plus PR #1's and this plan's additions), `pnpm build`, and `pnpm lint` with no new errors.

**The paid path, by hand.** Nothing in this plan exercises `createBatch` on-chain; it costs real xBZZ on Gnosis mainnet and there is no free path to it. Before any real run, with one wallet:

1. Generate 1 code, fund it, and confirm `Check wallets` in **Gift drives** flips to "1 of 1 wallet can pay".
2. Create the drive at depth 17 and the live minimum amount (about 0.02 xBZZ at the price measured 2026-09-07 — read the figure off the form, it tracks the chain).
3. On `https://gnosisscan.io/tx/<hash>`, confirm the `BatchCreated` log's `owner` **equals the gift wallet address** — the whole design rests on this — and that `depth` and `immutableFlag` match the form.
4. Confirm the recipient's side: import the key into a Bee node and check `curl http://localhost:1633/stamps` lists the batch. `/stamps` returns only batches owned by that node's key, so this is what proves the gift drive is usable.
5. Build a handout kit from that session and confirm the xlsx `Gift drive` column holds the batch ID and the card QR decodes to the JSON payload.
6. Paste the kit's own `Copy gift drives` output back into both paste boxes and confirm the same drive comes through — this is the cross-session path.

**Failure paths to exercise:** a run of three wallets where one has no xDAI — the run must report `2 succeeded, 1 failed` and keep going; and a duplicate key in a pasted kit list — the kit must refuse with `duplicate key in batch` rather than silently produce one card fewer.

## Open questions

- **Should a card print the gift drive as text?** Not planned. The batch ID is 66 characters, cards deliberately carry no key text, and a recipient's Bee node discovers batches it owns from `/stamps` without being told the ID. Revisit only if step 4 above shows the node does not find it.
- **Which PR merges first.** This plan assumes PR #2, because it owns the test runner version, the vitest config, the PR template and the kit that Phase B extends. If PR #1 goes first instead, PR #2's rebase must still delete PR #1's `qrUtils.ts` print-sheet code (Task 3) and align the `vitest` version.
