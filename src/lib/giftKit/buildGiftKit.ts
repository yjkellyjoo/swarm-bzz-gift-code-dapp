import { computeCardLayout } from './layout';
import { buildItems } from './items';
import { itemPayload } from './payload';
import { assessScannability, mmPerModule } from './modulePitch';
import { pdfName, qrEntryPath, sanitiseBatchName, xlsxName } from './naming';
import { buildPdf } from './pdfWrite';
import { maxQrVersion, renderQr } from './qrPng';
import type { GiftKitOptions, KitReport, QrArtifact, VerificationProblem } from './types';
import { verifyKit } from './verify';
import type { Rasteriser } from './verify';
import { buildXlsx } from './xlsxWrite';
import { packKit } from './zip';

const COLS = 4;
const ROWS = 5;
const YIELD_EVERY = 20;

export interface BuildProgress {
  phase: 'build' | 'verify';
  done: number;
  total: number;
}

interface InternalOptions extends GiftKitOptions {
  /** Test seam: proves the failure path rather than assuming it works. */
  __corruptFirstQr?: boolean;
  /** Test seam: lets node supply a canvas-backed rasteriser. */
  __rasterise?: Rasteriser;
}

export async function buildGiftKit(
  keys: string[],
  options: InternalOptions,
  onProgress?: (p: BuildProgress) => void,
): Promise<{ zipBytes: Uint8Array; report: KitReport; name: string }> {
  const items = buildItems(keys, options.driveByKey);
  const name = sanitiseBatchName(options.name);
  const layout = computeCardLayout(COLS, ROWS);
  const version = maxQrVersion(items.map(itemPayload));

  const qrs: QrArtifact[] = [];
  for (const [i, item] of items.entries()) {
    qrs.push(renderQr(itemPayload(item), version));
    onProgress?.({ phase: 'build', done: i + 1, total: items.length });
    // Yield so a 300-key batch does not freeze the tab.
    if (i % YIELD_EVERY === YIELD_EVERY - 1) await new Promise(r => setTimeout(r, 0));
  }
  if (options.__corruptFirstQr) {
    qrs[0] = renderQr(itemPayload(items[items.length - 1]), version);
  }

  const xlsxBytes = await buildXlsx(items, qrs, name);
  const pdfBytes = await buildPdf(items, qrs, layout, name);

  // pdf.js needs a real canvas. In the browser that is the DOM; tests inject a
  // node-canvas rasteriser so the PDF pass is exercised there too.
  const rasterise =
    options.__rasterise ??
    (typeof window === 'undefined' ? null : (await import('./rasterise')).rasterisePages);

  const problems: VerificationProblem[] = await verifyKit({
    items,
    qrs,
    xlsxBytes,
    pdfBytes,
    rasterise,
    onProgress: (done, total) => onProgress?.({ phase: 'verify', done, total }),
  });

  const pitch = mmPerModule(layout.qrMm, qrs[0].moduleCount);
  const scannability = assessScannability(pitch);
  if (!scannability.ok) problems.push({ where: 'print', detail: scannability.message });

  // No unverified kit ever reaches a caller.
  if (problems.length > 0) {
    throw new Error(
      `Gift kit failed verification:\n${problems
        .map(p => `  - ${p.where}: ${p.detail}`)
        .join('\n')}`,
    );
  }

  const entries: Record<string, Uint8Array> = {
    [xlsxName(name)]: xlsxBytes,
    [pdfName(name)]: pdfBytes,
  };
  items.forEach((item, i) => {
    entries[qrEntryPath(item, items.length)] = qrs[i].bytes;
  });

  const report: KitReport = {
    count: items.length,
    pages: Math.ceil(items.length / layout.perPage),
    qrMm: layout.qrMm,
    moduleCount: qrs[0].moduleCount,
    mmPerModule: pitch,
  };

  return { zipBytes: packKit(entries), report, name };
}
