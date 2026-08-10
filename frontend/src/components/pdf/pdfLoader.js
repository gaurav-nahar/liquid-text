// pdfLoader.js
import * as pdfjsLib from "pdfjs-dist/build/pdf";
import "pdfjs-dist/web/pdf_viewer.css";
import pdfWorker from "pdfjs-dist/build/pdf.worker.entry";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

/**
 * Loads a PDF and renders all pages into container
 * @param {string} fileUrl - PDF URL
 * @param {HTMLElement} container - DOM container
 * @param {number} scale - zoom scale
 * @param {function} onPageRendered - optional callback for each page
 * @returns {Promise<number>} - number of pages
 */
/**
 * Sets up the PDF layout (wrappers) without rendering content.
 *
 * Pages are built into a detached fragment and swapped into `container` in one
 * synchronous step at the very end. Two overlapping setups (StrictMode's double
 * mount, a fast document switch) therefore can't interleave their appends into
 * the same container and leave orphaned, unobserved page shells behind.
 *
 * The wrappers are returned rather than observed here: the caller must only start
 * observing once it has published the document, or the observer's first (async)
 * delivery fires with no document to render from and never fires again.
 *
 * @param {string} fileUrl - PDF URL
 * @param {HTMLElement} container - DOM container
 * @param {number} scale - zoom scale
 * @param {function} onPageSetup - optional callback for each page wrapper
 * @param {function} shouldAbort - returns true when this load has been superseded
 * @returns {Promise<{pdfDocument, numPages, totalUnscaledHeight, maxUnscaledWidth, wrappers, aborted}>}
 */
export async function setupPDF(fileUrl, container, scale = 1.5, onPageSetup, shouldAbort = () => false) {
  if (!container) throw new Error("Container element required");

  const aborted = (pdfDocument = null) => ({
    pdfDocument, numPages: 0, totalUnscaledHeight: 0, maxUnscaledWidth: 0,
    wrappers: [], aborted: true,
  });

  if (shouldAbort()) return aborted();

  const loadingTask = pdfjsLib.getDocument(fileUrl);
  const pdfDocument = await loadingTask.promise;
  if (shouldAbort()) return aborted(pdfDocument);

  const numPages = pdfDocument.numPages;

  const BATCH_SIZE = 20;

  const fragment = document.createDocumentFragment();
  const wrappers = [];
  let totalUnscaledHeight = 0;
  let maxUnscaledWidth = 0;

  for (let i = 1; i <= numPages; i += BATCH_SIZE) {
    const promises = [];
    for (let j = i; j < i + BATCH_SIZE && j <= numPages; j++) {
      promises.push((async (pageNum) => {
        const page = await pdfDocument.getPage(pageNum);
        const viewport = page.getViewport({ scale });
        return { pageNum, viewport };
      })(j));
    }

    const results = await Promise.all(promises);
    // Every batch boundary is a chance for a newer load to have taken over.
    if (shouldAbort()) return aborted(pdfDocument);

    results.forEach(({ pageNum, viewport }) => {
      const wrapper = document.createElement("div");
      wrapper.className = "pdf-page-wrapper";
      wrapper.style.position = "relative";
      wrapper.style.marginBottom = "20px";
      wrapper.style.width = `${viewport.width}px`;
      wrapper.style.height = `${viewport.height}px`;
      wrapper.dataset.pageNumber = pageNum;
      wrapper.dataset.loaded = "false";

      fragment.appendChild(wrapper);
      wrappers.push(wrapper);

      totalUnscaledHeight += viewport.height + 20; // 20 is marginBottom
      if (viewport.width > maxUnscaledWidth) maxUnscaledWidth = viewport.width;

      if (onPageSetup) onPageSetup(pageNum, wrapper);
    });
  }

  // Last check before touching the DOM — nothing may await between here and the
  // swap, so a load that is still current cannot be clobbered halfway through.
  if (shouldAbort()) return aborted(pdfDocument);
  container.innerHTML = "";
  container.appendChild(fragment);

  return { pdfDocument, numPages, totalUnscaledHeight, maxUnscaledWidth, wrappers, aborted: false };
}

/**
 * Renders a specific page into its existing wrapper
 * @param {Object} pdfDocument - The loaded PDFJS document
 * @param {HTMLElement} wrapper - The wrapper div for this page
 * @param {number} scale - Zoom scale
 */
export function renderPage(pdfDocument, wrapper, scale = 1.5) {
  if (!pdfDocument || !wrapper) return Promise.resolve(null);

  // Already on screen — hand back the existing nodes. Returning nothing here used
  // to make callers skip registering the page, so its React layers never mounted.
  if (wrapper.dataset.loaded === "true") {
    const canvas = wrapper.querySelector("canvas");
    return Promise.resolve(
      canvas ? { canvas, textLayerDiv: wrapper.querySelector(".textLayer") } : null
    );
  }

  // A render is already in flight — share it instead of reporting failure.
  if (wrapper._renderPromise) return wrapper._renderPromise;

  const promise = renderPageInternal(pdfDocument, wrapper, scale).finally(() => {
    wrapper._renderPromise = null;
  });
  wrapper._renderPromise = promise;
  return promise;
}

async function renderPageInternal(pdfDocument, wrapper, scale) {
  try {
    const pageNum = parseInt(wrapper.dataset.pageNumber, 10);
    const page = await pdfDocument.getPage(pageNum);
    const viewport = page.getViewport({ scale });

    // 1. Create Canvas if missing
    let canvas = wrapper.querySelector("canvas");
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.position = "absolute";
      canvas.style.top = "0";
      canvas.style.left = "0";
      canvas.style.zIndex = "1";
      canvas.style.pointerEvents = "auto";
      wrapper.appendChild(canvas);
    }

    // 2. Render Canvas
    const ctx = canvas.getContext("2d");
    await page.render({ canvasContext: ctx, viewport }).promise;

    // 3. Create Text Layer if missing
    let textLayerDiv = wrapper.querySelector(".textLayer");
    if (!textLayerDiv) {
      textLayerDiv = document.createElement("div");
      textLayerDiv.className = "textLayer";
      textLayerDiv.style.position = "absolute";
      textLayerDiv.style.top = 0;
      textLayerDiv.style.left = 0;
      textLayerDiv.style.height = `${viewport.height}px`;
      textLayerDiv.style.width = `${viewport.width}px`;
      textLayerDiv.style.zIndex = "2";
      textLayerDiv.style.pointerEvents = "auto";
      textLayerDiv.style.userSelect = "text";
      wrapper.appendChild(textLayerDiv);
    }

    // 4. Render Text
    const textContent = await page.getTextContent();

    // 🎯 CRITICAL: Store raw textContent for accurate Hindi/Unicode extraction
    wrapper._pdfTextContent = textContent;
    wrapper._pdfViewport = viewport;

    await pdfjsLib.renderTextLayer({
      textContent,
      container: textLayerDiv,
      viewport,
      textDivs: [],
    }).promise;

    wrapper.dataset.loaded = "true";
    return { canvas, textLayerDiv };
  } catch (err) {
    console.error(`Error rendering page ${wrapper.dataset.pageNumber}:`, err);
    // Leave the wrapper renderable so a retry can succeed — a half-drawn canvas
    // from the failed attempt would otherwise be mistaken for a finished page.
    wrapper.dataset.loaded = "false";
    return null;
  }
}

/**
 * Unloads a page's content to free memory
 * @param {HTMLElement} wrapper 
 */
export function unloadPage(wrapper) {
  if (wrapper.dataset.loaded === "false") return;

  wrapper.innerHTML = ""; // Remove canvas and textLayer
  wrapper.dataset.loaded = "false";
  wrapper._renderPromise = null;
  wrapper._pdfTextContent = null;
  wrapper._pdfViewport = null;
}
