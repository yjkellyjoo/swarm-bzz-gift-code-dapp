/**
 * Render each PDF page to pixels for verification.
 *
 * Browser only: pdf.js needs a real canvas. In node the PDF check is skipped
 * and the card-ordering logic is covered by readingOrder's own tests.
 */
export async function* rasterisePages(
  pdfBytes: Uint8Array,
  dpi = 200,
): AsyncGenerator<ImageData> {
  const pdfjs = await import('pdfjs-dist');
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  // Set here rather than in a shared module: init order can otherwise let
  // pdf.js's own default workerSrc win.
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  // getDocument puts data.buffer in the worker's transfer list, detaching it.
  // Hand it a copy so the caller's bytes survive to reach the zip -- passing
  // the original leaves a zero-length PDF in the download.
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(pdfBytes) });
  const doc = await loadingTask.promise;

  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: dpi / 72 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d')!;
      // pdf.js v6 takes `canvas` as the primary parameter; canvasContext is legacy.
      await page.render({ canvas, viewport }).promise;
      yield ctx.getImageData(0, 0, canvas.width, canvas.height);
      page.cleanup();
    }
  } finally {
    // Each export otherwise leaves a worker behind; an operator doing several
    // 300-key batches in one tab accumulates them.
    await loadingTask.destroy();
  }
}
