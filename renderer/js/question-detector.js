const QUESTION_PATTERN = /^(\d{1,3})[.．]$/;

export const FAIL_REASONS = {
  NO_TEXT_LAYER: '텍스트 레이어가 없는 PDF입니다 (스캔본)',
  LOW_DETECTION: '문항 번호를 충분히 감지하지 못했습니다',
  MISMATCH: '감지된 문항 수가 정답 파일과 맞지 않습니다',
};

export function createMappingState(status, expectedCount, map = {}, reason = '') {
  const detected = Object.keys(map).map(Number);
  const failedQuestions = [];
  for (let q = 1; q <= expectedCount; q += 1) {
    if (!getMappedPage(map[String(q)])) failedQuestions.push(q);
  }

  return {
    status,
    map,
    detectedCount: detected.length,
    expectedCount,
    failedQuestions,
    isManuallyOverridden: false,
    reason,
  };
}

function getMappedPage(entry) {
  if (!entry) return null;
  if (typeof entry === 'number') return entry;
  return entry.page || null;
}

export async function detectQuestionMap(pdf, expectedCount) {
  if (!pdf) {
    return createMappingState('failed', expectedCount, {}, 'PDF가 로드되지 않았습니다');
  }

  const map = {};
  let textItems = 0;

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    textItems += content.items.length;

    for (const item of content.items) {
      const tokens = String(item.str || '').trim().split(/\s+/);
      for (const token of tokens) {
        const match = QUESTION_PATTERN.exec(token);
        if (!match) continue;
        const questionNum = Number(match[1]);
        if (questionNum >= 1 && questionNum <= expectedCount && !map[String(questionNum)]) {
          const [, , , , x, y] = item.transform;
          const [, viewportY] = viewport.convertToViewportPoint(x, y);
          map[String(questionNum)] = {
            page: pageNum,
            y,
            viewportY,
          };
        }
      }
    }
  }

  if (textItems === 0) {
    return createMappingState('failed', expectedCount, {}, FAIL_REASONS.NO_TEXT_LAYER);
  }

  const detectedCount = Object.keys(map).length;
  if (detectedCount === expectedCount) {
    return createMappingState('success', expectedCount, map);
  }
  if (detectedCount > 0) {
    return createMappingState('partial', expectedCount, map, FAIL_REASONS.MISMATCH);
  }
  return createMappingState('failed', expectedCount, map, FAIL_REASONS.LOW_DETECTION);
}

export function parseManualQuestionMap(input, expectedCount, totalPages) {
  const map = {};
  String(input || '').split(/\r?\n/).forEach((line) => {
    const match = /^\s*(\d{1,3})\s*[:=,\s]\s*(\d{1,4})\s*$/.exec(line);
    if (!match) return;
    const questionNum = Number(match[1]);
    const pageNum = Number(match[2]);
    if (questionNum >= 1 && questionNum <= expectedCount && pageNum >= 1 && pageNum <= totalPages) {
      map[String(questionNum)] = { page: pageNum };
    }
  });
  const state = createMappingState('partial', expectedCount, map, FAIL_REASONS.MISMATCH);
  state.status = state.detectedCount === expectedCount ? 'success' : 'partial';
  state.isManuallyOverridden = true;
  return state;
}

export function formatQuestionMap(map, expectedCount) {
  const lines = [];
  for (let q = 1; q <= expectedCount; q += 1) {
    const entry = map?.[String(q)];
    const page = getMappedPage(entry);
    if (page) lines.push(`${q}:${page}`);
  }
  return lines.join('\n');
}
