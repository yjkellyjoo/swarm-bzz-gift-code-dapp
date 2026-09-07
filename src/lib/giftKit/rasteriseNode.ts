import { createCanvas } from '@napi-rs/canvas';

/**
 * Rasterise a PDF to pixels under node, for tests.
 *
 * The browser path (rasterise.ts) is the one that ships; this exists so the
 * PDF decode-back pass -- the only verification step that needs a canvas --
 * can run in `pnpm test` rather than only by hand in a browser.
 */
export async function* rasterisePagesNode(
  pdfBytes: Uint8Array,
  dpi = 200,
): AsyncGenerator<ImageData> {
  // Legacy build: no worker, no DOM assumptions.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

  // Same copy-before-transfer rule as the browser path: getDocument puts
  // data.buffer in the transfer list and detaches the caller's array.
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(pdfBytes) });
  const doc = await loadingTask.promise;

  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: dpi / 72 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const ctx = canvas.getContext('2d');
      await page.render({
        // @napi-rs/canvas is API-compatible with the browser 2D context.
        canvas: canvas as unknown as HTMLCanvasElement,
        canvasContext: ctx as unknown as CanvasRenderingContext2D,
        viewport,
      }).promise;
      const raw = ctx.getImageData(0, 0, canvas.width, canvas.height);
      yield { data: raw.data, width: raw.width, height: raw.height } as ImageData;
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }
}
