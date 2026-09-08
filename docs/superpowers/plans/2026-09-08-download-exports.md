# Download Exports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Generate Codes and Gift Drives steps a download button beside their existing copy button, with one batch-name input naming every file the app produces.

**Architecture:** Two small lib modules carry the work — one that builds the export text (the shape both copy and download need) and one that puts a file on disk. The batch name moves out of `GiftKitExport` and up into the generate form, so a single input names the gift-codes `.txt`, the gift-drives `.tsv`, and the handout kit's `.zip`/`.xlsx`/`.pdf`.

**Tech Stack:** React 19, TypeScript (strict, `verbatimModuleSyntax`, `erasableSyntaxOnly`), Vite 7, vitest 4.1.11 (`environment: 'node'`), Tailwind + shadcn/ui.

**Spec:** No separate spec file — the design was agreed in chat on 2026-09-08. It is restated in full under "Agreed design" below, so this plan travels on its own.

## Agreed design

| Surface | Copy button | Download button |
|---|---|---|
| Generate Codes | **unchanged** — bare keys, or the TSV table once drives exist | `<base> - gift codes.txt`, **always keys only**, one per line |
| Gift Drives | **unchanged** — TSV table with header | `<base> - gift drives.tsv`, same TSV table |

`<base>` is one shared batch name, defaulting to `Swarm BZZ Gift Codes`.

## Global Constraints

- **Do not change any existing copy-button behaviour.** `handleCopyCodes` keeps its bare-keys/TSV switch; `handleCopyResults` keeps its table. They are refactored to call the shared builders, and the output must be byte-identical. This was decided explicitly after an earlier proposal to unify them was rejected.
- **The gift-codes download is keys only**, one per line, raw. Not a Markdown list, not a table: a `- ` prefix or an address column would stop it pasting back into either paste box.
- **Every export must round-trip through `parseGiftDriveList`.** Both paste boxes read these files. This is where a silent bug already cost keys once: a tab-separated line was read as an export row and only field 1 survived, so Recover Funds returned 1 key of 3 with no error.
- **A batch ID is 32 bytes of hex, and any 32-byte value in range is a valid secp256k1 key**, so nothing downstream can tell one from a private key. Column position is the only thing that distinguishes them — never emit a batch ID where a key is expected.
- `vitest` runs with `environment: 'node'` and `include: ['src/**/*.test.ts']`. There is no DOM, so anchor-click downloads and React components cannot be unit-tested here; those are verified in the browser and the result reported.
- `pnpm lint` must introduce **no new** errors. `main` carries 5 pre-existing (`no-explicit-any` in `gnosisContract.ts`, `react-refresh` in `WalletBalanceCard.tsx` and `ui/button.tsx`).
- Keys are never logged, printed as text on a card, or sent off-origin. A download writes them to disk, which is the point of the feature and consistent with the existing clipboard path.
- Branch from `main` — do not commit to `main` directly.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/batchName.ts` | **Create.** Owns the batch name as a shared concept: sanitising it, and deriving the two new filenames. `sanitiseBatchName` moves here from `giftKit/naming.ts`, which re-exports it so the kit's callers and tests are untouched. |
| `src/lib/batchName.test.ts` | **Create.** Filename derivation, including names that are illegal on disk. |
| `src/lib/giftCodeTable.ts` | **Create.** The one place export text is assembled: `buildKeyList` (bare keys) and `buildGiftCodeTable` (TSV). Both copy handlers currently inline these. |
| `src/lib/giftCodeTable.test.ts` | **Create.** Output shape plus the round-trip invariant. |
| `src/lib/downloadFile.ts` | **Create.** One Blob/object-URL/anchor implementation. `GiftKitExport`'s private `downloadZip` becomes a caller. |
| `src/lib/giftKit/naming.ts` | **Modify.** Re-export `sanitiseBatchName` from its new home. |
| `src/lib/types.ts` | **Modify.** `WalletFormData` gains `batchName`. |
| `src/pages/GenerateCodes.tsx` | **Modify.** Batch-name field, prop threading, download button, copy refactored onto the builders. |
| `src/components/GiftDriveStep.tsx` | **Modify.** Accepts `batchName`, gains a download button, copy refactored onto the builder. |
| `src/components/GiftKitExport.tsx` | **Modify.** Accepts `batchName`, loses its own input/state/`DEFAULT_NAME`, uses the shared download helper. |

---

## Task 1: The export builders

Both copy handlers assemble their text inline today, and the downloads need byte-identical output. One module owns both shapes.

**Files:**
- Create: `src/lib/giftCodeTable.ts`
- Create: `src/lib/giftCodeTable.test.ts`

**Interfaces:**
- Consumes: `parseGiftDriveList` from `src/lib/giftDriveList.ts` (tests only).
- Produces:
  - `interface ExportableCode { privateKey: string; address: string; batchId?: string }` — satisfied structurally by both `GiftCode` (`src/lib/types.ts`) and `BatchResult` (`src/lib/postageBatch.ts`), so neither needs changing.
  - `buildKeyList(codes: ExportableCode[]): string`
  - `buildGiftCodeTable(codes: ExportableCode[]): string`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/giftCodeTable.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildKeyList, buildGiftCodeTable } from './giftCodeTable';
import { parseGiftDriveList } from './giftDriveList';
import type { ExportableCode } from './giftCodeTable';

// Well-known test keys; never used for real funds.
const KEY_A = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const ADDRESS_A = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const KEY_B = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a';
const ADDRESS_B = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';
const BATCH_A = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';

const codes: ExportableCode[] = [
  { privateKey: KEY_A, address: ADDRESS_A, batchId: BATCH_A },
  { privateKey: KEY_B, address: ADDRESS_B },
];

describe('buildKeyList', () => {
  it('is one bare key per line, and nothing else', () => {
    expect(buildKeyList(codes)).toBe(`${KEY_A}\n${KEY_B}`);
  });

  // The gift-codes download is this text. An address column or a "- " bullet
  // would stop it pasting back into either paste box.
  it('never includes the address or the batch id', () => {
    const text = buildKeyList(codes);
    expect(text).not.toContain(ADDRESS_A);
    expect(text).not.toContain(BATCH_A);
  });

  it('handles an empty list', () => {
    expect(buildKeyList([])).toBe('');
  });
});

describe('buildGiftCodeTable', () => {
  it('writes a header and one tab-separated row per code', () => {
    expect(buildGiftCodeTable(codes)).toBe(
      [
        ['privateKey', 'address', 'batchId'].join('\t'),
        [KEY_A, ADDRESS_A, BATCH_A].join('\t'),
        [KEY_B, ADDRESS_B, ''].join('\t'),
      ].join('\n'),
    );
  });

  it('leaves the batch column empty rather than writing undefined', () => {
    expect(buildGiftCodeTable([codes[1]])).not.toContain('undefined');
  });

  it('handles an empty list, keeping the header', () => {
    expect(buildGiftCodeTable([])).toBe(['privateKey', 'address', 'batchId'].join('\t'));
  });
});

// The invariant that keeps both paste boxes working. A silent failure here
// once returned 1 key of 3 from a tab-separated line, leaving wallets
// undrained with nothing to say so.
describe('round-trips through parseGiftDriveList', () => {
  it('a key list comes back as the same keys, with no batches', () => {
    expect(parseGiftDriveList(buildKeyList(codes))).toEqual([
      { privateKey: KEY_A },
      { privateKey: KEY_B },
    ]);
  });

  it('a table comes back with its batches attached to the right keys', () => {
    expect(parseGiftDriveList(buildGiftCodeTable(codes))).toEqual([
      { privateKey: KEY_A, batchId: BATCH_A },
      { privateKey: KEY_B },
    ]);
  });

  it('never yields a batch id as if it were a key', () => {
    const keys = parseGiftDriveList(buildGiftCodeTable(codes)).map(e => e.privateKey);
    expect(keys).toEqual([KEY_A, KEY_B]);
    expect(keys).not.toContain(BATCH_A);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `pnpm test src/lib/giftCodeTable.test.ts`
Expected: FAIL — `Cannot find module './giftCodeTable'`.

- [ ] **Step 3: Write the builders**

Create `src/lib/giftCodeTable.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm test src/lib/giftCodeTable.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/giftCodeTable.ts src/lib/giftCodeTable.test.ts
git commit -m "feat: one place that builds gift code exports"
```

---

## Task 2: Batch names and filenames

The batch name stops being a handout-kit detail and becomes the name of everything the app writes, so it moves to its own module. `giftKit/naming.ts` re-exports `sanitiseBatchName` rather than moving its callers, keeping that module's tests and imports untouched.

**Files:**
- Create: `src/lib/batchName.ts`
- Create: `src/lib/batchName.test.ts`
- Modify: `src/lib/giftKit/naming.ts`

**Interfaces:**
- Produces:
  - `sanitiseBatchName(base: string): string` — moved verbatim from `giftKit/naming.ts`
  - `giftCodesFileName(base: string): string` → `"<sanitised> - gift codes.txt"`
  - `giftDrivesFileName(base: string): string` → `"<sanitised> - gift drives.tsv"`
  - `DEFAULT_BATCH_NAME = 'Swarm BZZ Gift Codes'`
- Consumed by: Tasks 3, 4 and 5.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/batchName.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_BATCH_NAME,
  giftCodesFileName,
  giftDrivesFileName,
  sanitiseBatchName,
} from './batchName';

describe('sanitiseBatchName', () => {
  it('keeps an ordinary name', () => {
    expect(sanitiseBatchName('Devcon 2026')).toBe('Devcon 2026');
  });

  // An organiser typing this must not produce a broken filename, and a slash
  // would nest a zip entry in a phantom folder.
  it('replaces characters that break filenames and Excel sheet names', () => {
    expect(sanitiseBatchName('ETHRome 2026: batch 1/2')).toBe('ETHRome 2026- batch 1-2');
  });

  it('falls back when the name is empty or only separators', () => {
    expect(sanitiseBatchName('')).toBe('Gift codes');
    expect(sanitiseBatchName('   ')).toBe('Gift codes');
  });
});

describe('filenames', () => {
  it('names the two downloads after the batch', () => {
    expect(giftCodesFileName('Devcon 2026')).toBe('Devcon 2026 - gift codes.txt');
    expect(giftDrivesFileName('Devcon 2026')).toBe('Devcon 2026 - gift drives.tsv');
  });

  it('sanitises before naming', () => {
    expect(giftCodesFileName('ETHRome: 1/2')).toBe('ETHRome- 1-2 - gift codes.txt');
  });

  it('still produces a usable name from an empty batch name', () => {
    expect(giftCodesFileName('')).toBe('Gift codes - gift codes.txt');
    expect(giftDrivesFileName('')).toBe('Gift codes - gift drives.tsv');
  });

  it('has a default matching what the handout kit used', () => {
    expect(DEFAULT_BATCH_NAME).toBe('Swarm BZZ Gift Codes');
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `pnpm test src/lib/batchName.test.ts`
Expected: FAIL — `Cannot find module './batchName'`.

- [ ] **Step 3: Create the module**

Create `src/lib/batchName.ts`. The `sanitiseBatchName` body is moved verbatim from `src/lib/giftKit/naming.ts` — do not re-derive it, the handout kit's tests depend on this exact behaviour:

```ts
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
```

- [ ] **Step 4: Re-export from the kit's naming module**

In `src/lib/giftKit/naming.ts`, delete the `sanitiseBatchName` function and its doc comment, and add this near the top:

```ts
// Moved to lib/batchName: the batch name now names the two downloads as well
// as the kit. Re-exported so the kit's own callers and tests are unaffected.
export { sanitiseBatchName } from '../batchName';
```

Leave `truncateAddress`, `qrEntryPath`, `xlsxName` and `pdfName` exactly as they are.

- [ ] **Step 5: Run the tests and confirm they pass**

Run: `pnpm test src/lib/batchName.test.ts src/lib/giftKit/`
Expected: PASS, including the kit's existing `naming.test.ts` and `buildGiftKit.test.ts` — the re-export means they never notice the move.

- [ ] **Step 6: Commit**

```bash
git add src/lib/batchName.ts src/lib/batchName.test.ts src/lib/giftKit/naming.ts
git commit -m "refactor: make the batch name a shared concept, not a kit detail"
```

---

## Task 3: The download helper

`GiftKitExport` already has this code privately. A third caller makes it shared rather than copied.

**Files:**
- Create: `src/lib/downloadFile.ts`
- Modify: `src/components/GiftKitExport.tsx`

**Interfaces:**
- Produces:
  - `downloadBlob(blob: Blob, filename: string): void`
  - `downloadText(text: string, filename: string, mimeType?: string): void` — defaults to `'text/plain;charset=utf-8'`
- Consumed by: Tasks 4 and 5.

There is no DOM in the test environment, so this module is verified by the build plus the handout kit continuing to download in the browser. Do not add jsdom for it.

- [ ] **Step 1: Write the module**

Create `src/lib/downloadFile.ts`:

```ts
/**
 * Put a file in front of the user.
 *
 * The object URL is revoked immediately after the click: the blob is already
 * captured by the download, and leaving it alive pins the whole file in memory
 * for the life of the tab - which for a 300-key handout kit is not small.
 */

export function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

export function downloadText(
    text: string,
    filename: string,
    mimeType: string = 'text/plain;charset=utf-8'
): void {
    downloadBlob(new Blob([text], { type: mimeType }), filename);
}
```

- [ ] **Step 2: Point the handout kit at it**

In `src/components/GiftKitExport.tsx`, delete the private `downloadZip` function (the `function downloadZip(bytes: Uint8Array, filename: string) { ... }` block near the top) and add to the imports:

```ts
import { downloadBlob } from '../lib/downloadFile';
```

Then replace the call site:

```ts
      downloadZip(zipBytes, `${usedName}.zip`);
```

with:

```ts
      downloadBlob(
        new Blob([zipBytes as unknown as BlobPart], { type: 'application/zip' }),
        `${usedName}.zip`,
      );
```

- [ ] **Step 3: Verify nothing regressed**

Run: `pnpm test && pnpm build`
Expected: PASS. The kit's tests do not exercise the download path (no DOM), so this is checking that the removal left no dangling reference.

- [ ] **Step 4: Confirm the kit still downloads**

Run `pnpm dev`, open the Generate tab, paste two throwaway keys into the handout kit's **Paste a key list**, and click **Download handout kit**. A `.zip` must land in Downloads and open correctly. This is the only check that covers the refactor, because the anchor click cannot be tested here.

- [ ] **Step 5: Commit**

```bash
git add src/lib/downloadFile.ts src/components/GiftKitExport.tsx
git commit -m "refactor: share one download implementation"
```

---

## Task 4: One batch name across the three steps

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/pages/GenerateCodes.tsx`
- Modify: `src/components/GiftDriveStep.tsx`
- Modify: `src/components/GiftKitExport.tsx`

**Interfaces:**
- Consumes: `DEFAULT_BATCH_NAME` from `src/lib/batchName.ts` (Task 2).
- Produces:
  - `WalletFormData` gains `batchName: string`
  - `GiftDriveStepProps` gains `batchName: string`
  - `GiftKitExportProps` gains `batchName: string`

- [ ] **Step 1: Add the field to the form type**

In `src/lib/types.ts`, extend `WalletFormData`:

```ts
export interface WalletFormData {
  xdaiAmount: number;
  xbzzAmount: number;
  walletCount: number;
  /** Names every file the app writes: both downloads and the handout kit. */
  batchName: string;
}
```

- [ ] **Step 2: Default and load it**

In `src/pages/GenerateCodes.tsx`, import the default:

```ts
import { DEFAULT_BATCH_NAME } from '../lib/batchName';
```

Add it to `getDefaultFormData`:

```ts
    batchName: DEFAULT_BATCH_NAME,
```

And to `loadFormFromStorage`'s returned object, following the same defensive shape as every other field there:

```ts
      batchName:
        typeof parsed.batchName === 'string'
          ? parsed.batchName
          : defaults.batchName,
```

- [ ] **Step 3: Render it as the form's first field**

In `src/pages/GenerateCodes.tsx`, immediately inside `<form onSubmit={handleSubmit} className="space-y-6">` and before the existing `walletCount` field:

```tsx
        <div className="space-y-2">
          <Label htmlFor="batchName">Batch name</Label>
          <Input
            id="batchName"
            name="batchName"
            type="text"
            value={form.batchName}
            onChange={handleChange}
            disabled={isLoading}
            required
          />
          <p className="text-xs text-muted-foreground">
            Names the downloads and the handout kit files.
          </p>
        </div>
```

`handleChange` already stores non-number inputs as strings and only triggers a balance check for the three funding fields, so it needs no change.

- [ ] **Step 4: Pass it down**

In `src/pages/GenerateCodes.tsx`, both render sites:

```tsx
          <GiftDriveStep
            giftCodes={giftCodes}
            batchName={form.batchName}
            onSessionDrivesCreated={handleSessionDrivesCreated}
          />
```

```tsx
          <GiftKitExport giftCodes={giftCodes} batchName={form.batchName} />
```

- [ ] **Step 5: Accept it in GiftDriveStep**

In `src/components/GiftDriveStep.tsx`, add the prop to the interface **only**:

```ts
interface GiftDriveStepProps {
  giftCodes: GiftCode[];
  batchName: string;
  onSessionDrivesCreated: (results: BatchResult[], params: BatchParams) => void;
}
```

Leave the destructuring line alone for now — Task 5 adds `batchName` to it at the point where it is first used. Declaring the prop without reading it compiles cleanly; destructuring it a task early risks tripping `noUnusedLocals`, and this task has to end green on its own.

- [ ] **Step 6: Replace GiftKitExport's own input with the prop**

In `src/components/GiftKitExport.tsx`:

- Delete `const DEFAULT_NAME = 'Swarm BZZ Gift Codes';`
- Delete `const [name, setName] = useState(DEFAULT_NAME);`
- Delete the whole "Batch name" block — the `<div className="space-y-2">` containing `<Label htmlFor="kitName">` and its `<Input id="kitName" …>`
- Extend the props:

```ts
interface GiftKitExportProps {
  giftCodes: GiftCode[];
  batchName: string;
}
```

```ts
export function GiftKitExport({ giftCodes, batchName }: GiftKitExportProps) {
```

- Replace the build option, which was `{ name: name.trim() || DEFAULT_NAME, driveByKey }`:

```ts
        { name: batchName.trim() || DEFAULT_BATCH_NAME, driveByKey },
```

- Add the import:

```ts
import { DEFAULT_BATCH_NAME } from '../lib/batchName';
```

Remove `Input` and `Label` from the imports only if nothing else in the file still uses them — check with `rg '<Input|<Label' src/components/GiftKitExport.tsx` before deleting, or the build fails on an unused import.

- [ ] **Step 7: Verify**

Run: `pnpm test && pnpm build && pnpm lint`
Expected: tests and build PASS; lint shows only `main`'s 5 pre-existing errors.

- [ ] **Step 8: Confirm the name reaches the kit**

Run `pnpm dev`. Set **Batch name** to `ETHRome 2026: batch 1/2`, paste two throwaway keys into the handout kit, and download. The zip must be named `ETHRome 2026- batch 1-2.zip` and contain `ETHRome 2026- batch 1-2.xlsx` — proving both the prop threading and the sanitiser.

- [ ] **Step 9: Commit**

```bash
git add src/lib/types.ts src/pages/GenerateCodes.tsx src/components/GiftDriveStep.tsx src/components/GiftKitExport.tsx
git commit -m "feat: one batch name for every file the app writes"
```

---

## Task 5: The two download buttons

**Files:**
- Modify: `src/pages/GenerateCodes.tsx`
- Modify: `src/components/GiftDriveStep.tsx`

**Interfaces:**
- Consumes: `buildKeyList`, `buildGiftCodeTable` (Task 1); `giftCodesFileName`, `giftDrivesFileName` (Task 2); `downloadText` (Task 3).

- [ ] **Step 1: Refactor the Generate copy handler onto the builders**

In `src/pages/GenerateCodes.tsx`, add the imports:

```ts
import { buildGiftCodeTable, buildKeyList } from '../lib/giftCodeTable';
import { giftCodesFileName } from '../lib/batchName';
import { downloadText } from '../lib/downloadFile';
```

Then replace the `const codesText = hasDrives ? … : …` expression inside `handleCopyCodes` with:

```ts
    const codesText = hasDrives
      ? buildGiftCodeTable(giftCodes)
      : buildKeyList(giftCodes);
```

Leave everything else in that function alone — the `hasDrives` switch, both success messages and the catch are unchanged behaviour.

- [ ] **Step 2: Add the download handler**

In `src/pages/GenerateCodes.tsx`, directly after `handleCopyCodes`:

```tsx
  function handleDownloadCodes() {
    if (giftCodes.length === 0) return;

    // Keys only, whether or not drives exist: this file is the plain-text
    // sibling of the key list, and an address column would stop it pasting
    // back. Batch IDs are exported from the gift drives step and the kit.
    downloadText(buildKeyList(giftCodes), giftCodesFileName(form.batchName));
    setSuccess(`Downloaded ${giftCodesFileName(form.batchName)}`);
  }
```

- [ ] **Step 3: Add the button**

In `src/pages/GenerateCodes.tsx`, immediately after the existing Copy Codes button:

```tsx
                <Button variant="secondary" type="button" onClick={handleDownloadCodes}>
                  Download codes
                </Button>
```

- [ ] **Step 4: Refactor the Gift Drives copy handler and add its download**

In `src/components/GiftDriveStep.tsx`, add `batchName` to the destructuring Task 4 deliberately left alone:

```ts
export function GiftDriveStep({ giftCodes, batchName, onSessionDrivesCreated }: GiftDriveStepProps) {
```

and add the imports:

```ts
import { buildGiftCodeTable } from '../lib/giftCodeTable';
import { giftDrivesFileName } from '../lib/batchName';
import { downloadText } from '../lib/downloadFile';
```

Replace the inline table construction at the top of `handleCopyResults`:

```ts
    const text = [
      ['privateKey', 'address', 'batchId'].join('\t'),
      ...results.map(r => [r.privateKey, r.address, r.batchId ?? ''].join('\t')),
    ].join('\n');
```

with:

```ts
    const text = buildGiftCodeTable(results);
```

Then add, directly after `handleCopyResults`:

```tsx
  function handleDownloadResults() {
    if (!results) return;

    // TSV, matching the copy button: the batch id is the point of this step,
    // and parseGiftDriveList reads this shape back into either paste box.
    downloadText(
      buildGiftCodeTable(results),
      giftDrivesFileName(batchName),
      'text/tab-separated-values;charset=utf-8',
    );
    setNotice(`Downloaded ${giftDrivesFileName(batchName)}`);
  }
```

- [ ] **Step 5: Add its button**

In `src/components/GiftDriveStep.tsx`, immediately after the existing "Copy gift drives" button:

```tsx
            <Button type="button" variant="secondary" onClick={handleDownloadResults}>
              Download gift drives
            </Button>
```

Wrap the two buttons in `<div className="flex gap-2">` so they sit side by side inside the existing `flex items-center justify-between` row.

- [ ] **Step 6: Verify the copy output did not change**

Run: `pnpm test && pnpm build && pnpm lint`
Expected: PASS with no new lint errors. Task 1's round-trip tests cover the builders; this step is confirming the refactor compiles and nothing else moved.

- [ ] **Step 7: Confirm both downloads in the browser**

Run `pnpm dev` and, without connecting a wallet:
1. Set **Batch name** to `Devcon 2026`.
2. Generate 2 codes. Click **Download codes** → `Devcon 2026 - gift codes.txt` lands, containing exactly two `0x…` lines and nothing else.
3. Click **Copy Codes** and paste into a scratch buffer — it must still be the same two bare keys, unchanged from before this work.
4. Paste the downloaded file's contents into the **Gift drives** paste box; it must read "2 keys to stamp".

The Gift Drives download needs a completed run, which costs real xBZZ — so verify that button's output by reading `buildGiftCodeTable`'s tests rather than by spending. Note in the report that it was not exercised in the browser.

- [ ] **Step 8: Commit**

```bash
git add src/pages/GenerateCodes.tsx src/components/GiftDriveStep.tsx
git commit -m "feat: download gift codes and gift drives alongside copying them"
```

---

## Verification

**Automated:** `pnpm test` (the existing suite plus Tasks 1 and 2), `pnpm build`, `pnpm lint` with no new errors.

**By hand**, per Task 3 Step 4, Task 4 Step 8 and Task 5 Step 7: the kit still downloads after the refactor; the batch name reaches the kit's filenames through the sanitiser; the codes download contains only keys and pastes back.

**Not exercised:** the Gift Drives download button, because populating it requires creating real postage batches on Gnosis mainnet with real xBZZ. Its content comes from `buildGiftCodeTable`, which is covered by tests including the round-trip; the untested part is the click.

## Self-review notes

- **Copy behaviour is unchanged** in both components — the only edits to those handlers replace inline string building with a call producing identical bytes, which the Task 1 tests pin.
- **`ExportableCode` is structural**, so `GiftCode` and `BatchResult` both satisfy it without either being modified or coupled to the other.
- **`sanitiseBatchName` is moved, not reimplemented**, and re-exported, so the handout kit's existing tests keep testing it.
- **No new dependency**, no jsdom: the two untestable pieces (anchor click, React rendering) are called out with browser steps instead of pretending unit tests cover them.
