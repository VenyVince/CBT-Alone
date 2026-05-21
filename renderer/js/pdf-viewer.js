import * as pdfjsLib from '../../node_modules/pdfjs-dist/build/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  '../../node_modules/pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

function toUint8Array(bufferLike) {
  if (!bufferLike) return null;
  if (bufferLike instanceof Uint8Array) return bufferLike;
  if (bufferLike instanceof ArrayBuffer) return new Uint8Array(bufferLike);
  if (Array.isArray(bufferLike)) return new Uint8Array(bufferLike);
  if (bufferLike.data) return new Uint8Array(bufferLike.data);
  return new Uint8Array(bufferLike);
}

export function createPdfViewer(options = {}) {
  const canvas = options.canvas || document.getElementById('pdf-canvas');
  const status = options.status || document.getElementById('pdf-status');
  const pageDisplay = options.pageDisplay || document.getElementById('page-display');
  const viewer = options.viewer || document.getElementById('pdf-viewer');
  const scrollContainer = options.scrollContainer || viewer?.closest('.pdf-panel') || viewer;
  const zoomInput = options.zoomInput || document.getElementById('zoom-input');
  const ctx = canvas?.getContext('2d');

  let pdf = null;
  let pageNum = 1;
  let scale = 1.2;
  let renderTask = null;
  let renderQueue = Promise.resolve();
  let questionMap = {};

  function setStatus(message) {
    if (status) {
      status.textContent = message || '';
      status.hidden = !message;
    }
  }

  function updatePageDisplay() {
    if (pageDisplay) {
      pageDisplay.textContent = `${pageNum} / ${pdf?.numPages || 0} page`;
    }
    if (zoomInput) {
      zoomInput.value = String(Math.round(scale * 100));
    }
  }

  function normalizeMapEntry(entry) {
    if (!entry) return null;
    if (typeof entry === 'number') return { page: entry };
    return entry;
  }

  function getViewportFitScale(page) {
    const viewport = page.getViewport({ scale: 1 });
    const availableWidth = Math.max((viewer?.clientWidth || window.innerWidth || 0) - 28, 240);
    const availableHeight = Math.max((scrollContainer?.clientHeight || window.innerHeight || 0) - 28, 240);
    const widthScale = availableWidth / viewport.width;
    const heightScale = availableHeight / viewport.height;
    return Math.max(Math.min(Math.min(widthScale, heightScale), 3), 0.4);
  }

  async function scrollToPdfY(page, pdfY) {
    if (!scrollContainer || pdfY === undefined || pdfY === null) return;
    const viewport = page.getViewport({ scale });
    const [, viewportY] = viewport.convertToViewportPoint(0, Number(pdfY));
    scrollContainer.scrollTop = Math.max(viewportY - 28, 0);
    scrollContainer.scrollLeft = 0;
  }

  async function drawPage(nextPageNum = pageNum, options = {}) {
    if (!pdf || !canvas || !ctx) return;
    pageNum = Math.min(Math.max(Number(nextPageNum) || 1, 1), pdf.numPages);
    if (renderTask) {
      renderTask.cancel();
      renderTask = null;
    }

    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const outputScale = window.devicePixelRatio || 1;

    canvas.width = Math.floor(viewport.width * outputScale);
    canvas.height = Math.floor(viewport.height * outputScale);
    canvas.style.width = `${Math.floor(viewport.width)}px`;
    canvas.style.height = `${Math.floor(viewport.height)}px`;

    const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;
    renderTask = page.render({ canvasContext: ctx, viewport, transform });

    try {
      await renderTask.promise;
      await scrollToPdfY(page, options.pdfY);
      if (scrollContainer && (options.pdfY === undefined || options.pdfY === null)) {
        scrollContainer.scrollTop = 0;
        scrollContainer.scrollLeft = 0;
      }
      setStatus('');
    } catch (error) {
      if (error?.name !== 'RenderingCancelledException') {
        setStatus('PDF 페이지를 렌더링하지 못했습니다.');
      }
    } finally {
      renderTask = null;
      updatePageDisplay();
    }
  }

  function renderPage(nextPageNum = pageNum, options = {}) {
    renderQueue = renderQueue
      .catch(() => {})
      .then(() => drawPage(nextPageNum, options));
    return renderQueue;
  }

  return {
    async load(bufferLike) {
      const data = toUint8Array(bufferLike);
      if (!data) {
        setStatus('PDF 파일을 찾을 수 없습니다.');
        return null;
      }

      setStatus('PDF를 불러오는 중입니다.');
      pdf = await pdfjsLib.getDocument({ data }).promise;
      pageNum = 1;
      updatePageDisplay();
      await renderPage(1);
      return pdf;
    },
    async goToPage(nextPageNum) {
      await renderPage(nextPageNum);
    },
    async goToQuestion(questionNum) {
      const entry = normalizeMapEntry(questionMap[String(questionNum)]);
      if (!entry?.page) return false;
      const page = await pdf?.getPage(entry.page);
      if (page) {
        scale = Math.max(getViewportFitScale(page) * 1.45, 1.25);
      }
      await renderPage(entry.page, { pdfY: entry.anchorY ?? entry.y });
      return true;
    },
    async zoomIn() {
      scale = Math.min(scale + 0.1, 3);
      await renderPage(pageNum);
    },
    async zoomOut() {
      scale = Math.max(scale - 0.1, 0.4);
      await renderPage(pageNum);
    },
    async setScale(nextScale) {
      scale = Math.max(Math.min(Number(nextScale) || scale, 3), 0.4);
      await renderPage(pageNum);
    },
    async setZoomPercent(percent) {
      await this.setScale((Number(percent) || 100) / 100);
    },
    async fitToScreen() {
      if (!pdf || !viewer) return;
      const page = await pdf.getPage(pageNum);
      scale = getViewportFitScale(page);
      await renderPage(pageNum);
    },
    async fitToQuarterPage() {
      if (!pdf || !viewer) return;
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1 });
      const availableWidth = Math.max(viewer.clientWidth - 28, 240);
      const fitScale = availableWidth / viewport.width;
      scale = Math.max(Math.min(fitScale * 2, 3), 0.8);
      await renderPage(pageNum);
    },
    setQuestionMap(map) {
      questionMap = map || {};
    },
    getPdfDocument() {
      return pdf;
    },
    getCurrentPage() {
      return pageNum;
    },
    getTotalPages() {
      return pdf?.numPages || 0;
    },
    getScale() {
      return scale;
    },
  };
}

export function bindPdfToolbar(pdfViewer) {
  document.getElementById('prev-page-btn')?.addEventListener('click', () => {
    pdfViewer.goToPage(pdfViewer.getCurrentPage() - 1);
  });
  document.getElementById('next-page-btn')?.addEventListener('click', () => {
    pdfViewer.goToPage(pdfViewer.getCurrentPage() + 1);
  });
  document.getElementById('zoom-in-btn')?.addEventListener('click', () => {
    pdfViewer.zoomIn();
  });
  document.getElementById('zoom-out-btn')?.addEventListener('click', () => {
    pdfViewer.zoomOut();
  });
  document.getElementById('fit-page-btn')?.addEventListener('click', () => {
    pdfViewer.fitToScreen();
  });
  const zoomInput = document.getElementById('zoom-input');
  zoomInput?.addEventListener('change', () => {
    pdfViewer.setZoomPercent(zoomInput.value);
  });
  zoomInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      pdfViewer.setZoomPercent(zoomInput.value);
    }
  });

  const wheelTarget = document.querySelector('.pdf-panel');
  wheelTarget?.addEventListener('wheel', (event) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : -1;
    const nextScale = pdfViewer.getScale() + (direction * 0.1);
    pdfViewer.setScale(nextScale);
  }, { passive: false });
}
