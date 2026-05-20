# CBT 구현 기획서 v6

> 범용 기출문제 CBT - Electron 데스크탑 앱의 PDF.js 문항 중심 뷰어 개선 기준 기획서

---

## 1. v5 대비 변경 사항 요약

| 구분 | v5 | v6 |
|------|----|----|
| 문항 이동 | 문항 번호 → PDF 페이지 이동 | 문항 번호 → PDF 페이지 + 문항 y좌표 위치로 이동 |
| 시험 시작 표시 | PDF.js 첫 페이지 렌더링 후 문항 매핑 | PDF 로드/감지 후 1번 문항 위치로 자동 이동 |
| PDF 표시 배율 | 확대/축소 버튼, 맞춤 버튼 | 확대/축소 버튼 + 직접 배율 입력 + Ctrl+마우스 휠 확대/축소 |
| 확대 동작 | canvas 렌더링 배율 변경 | CSS 제한 제거로 실제 표시 크기 확대/축소 보장 |
| 렌더링 안정성 | 단일 렌더 호출 중심 | 빠른 확대/축소 입력 시 렌더링 큐로 순차 처리 |
| 수동 매핑 | `문항:페이지` 입력 | 기존 입력 유지, 자동 감지는 y좌표까지 저장 |
| 기록 화면 | PDF.js 뷰어 | 직접 배율 입력과 확대/축소 UX 동일 적용 |

---

## 2. 프로젝트 개요

- **목적**: 어떤 과목이든 PDF 기출문제를 데스크탑에서 풀 수 있는 개인용 범용 CBT 시스템
- **특징**: 백엔드 없음, Electron 단독 실행, 광고 없음
- **배포**: Electron 패키징(`electron-builder`)
- **기술 스택**: Electron / HTML / CSS / Vanilla JS / electron-store / pdfjs-dist
- **주요 기능**:
  - PDF 가져오기 및 시험 목록 관리
  - PDF.js 기반 canvas 직접 렌더링
  - 문항 번호 자동 감지 및 문항 위치 스크롤
  - 문항 번호 패널과 응답 상태 표시
  - 페이지 이동, 확대/축소, 직접 배율 입력, Ctrl+휠 확대/축소
  - 시험 중 답안 자동 저장
  - 검토 표시, 미응답 이동, 제출 전 확인
  - 오답 체크, 점수 표시, 채점 기록 저장

---

## 3. v6 핵심 방향

v5는 PDF.js 기반으로 iframe을 제거하고 페이지 단위 렌더링을 도입했다. v6에서는 사용자가 지적한 실전 CBT UX 문제를 반영하여, 시험 시작 시 전체 페이지를 축소해 보여주는 방식보다 **현재 문항을 읽기 좋은 위치와 배율로 보여주는 방식**을 우선한다.

따라서 PDF 뷰어는 다음 원칙을 따른다.

- 시험 시작 후 가능한 경우 1번 문항 위치를 바로 보여준다.
- 문항 번호를 클릭하면 해당 문항이 시작되는 위치로 스크롤한다.
- 확대/축소는 버튼뿐 아니라 직접 배율 입력과 `Ctrl + 마우스 휠`을 지원한다.
- canvas가 CSS에 의해 다시 축소되지 않도록 실제 렌더링 크기를 그대로 표시한다.
- 빠른 확대/축소 입력에도 렌더링이 꼬이지 않도록 순차 렌더링한다.

---

## 4. 파일 구조

```text
project/
├── main.js
├── preload.js
├── package.json
├── installer.nsh
├── files/
│   └── icon.ico
├── renderer/
│   ├── index.html
│   ├── exam.html
│   ├── answer-editor.html
│   ├── history.html
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── index.js
│       ├── pdf-viewer.js
│       ├── question-detector.js
│       ├── navigation.js
│       ├── answers.js
│       ├── answer-editor.js
│       ├── history.js
│       └── timer.js
└── (런타임) app.getPath('userData')/
    ├── pdfs/
    └── answers/
```

---

## 5. PDF.js 뷰어 변경

파일:

- `renderer/js/pdf-viewer.js`
- `renderer/css/style.css`

### 주요 기능

- PDF.js canvas 렌더링
- 이전/다음 페이지 이동
- 확대/축소 버튼
- 직접 배율 입력
- 화면 맞춤
- Ctrl+마우스 휠 확대/축소
- 문항 y좌표 기반 자동 스크롤
- 렌더링 큐 기반 순차 렌더링

### 직접 배율 입력

시험 화면과 기록 화면의 PDF 툴바에 배율 입력 필드를 둔다.

```html
<label class="zoom-control">
  <span>배율</span>
  <input id="zoom-input" type="number" min="40" max="300" step="10" value="120">
  <span>%</span>
</label>
```

배율 범위:

- 최소: 40%
- 최대: 300%
- 입력 단위: 10%

### Ctrl+마우스 휠

PDF 패널에서 다음 조작을 지원한다.

- `Ctrl + 휠 위`: 확대
- `Ctrl + 휠 아래`: 축소

휠 이벤트는 브라우저 기본 확대 대신 앱 내부 PDF 배율 변경으로 처리한다.

```js
wheelTarget?.addEventListener('wheel', (event) => {
  if (!event.ctrlKey) return;
  event.preventDefault();
  const direction = event.deltaY < 0 ? 1 : -1;
  const nextScale = pdfViewer.getScale() + (direction * 0.1);
  pdfViewer.setScale(nextScale);
}, { passive: false });
```

### CSS 확대 제한 제거

canvas 확대가 실제 표시 크기에 반영되도록 `max-width: 100%` 제한을 제거한다.

```css
#pdf-canvas {
  background: #fff;
  box-shadow: 0 1px 8px rgba(31, 41, 51, 0.22);
}
```

---

## 6. 문항 번호 감지 변경

파일:

- `renderer/js/question-detector.js`

v5에서는 문항 번호 감지 결과가 문항 번호와 PDF 페이지 번호만 연결했다.

v6에서는 문항 시작 위치까지 이동하기 위해 감지 결과를 다음 구조로 확장한다.

```js
{
  "1": {
    page: 1,
    y: 742.12,
    viewportY: 98.4
  },
  "2": {
    page: 1,
    y: 610.77,
    viewportY: 229.8
  }
}
```

필드 의미:

| 필드 | 설명 |
|------|------|
| `page` | PDF 페이지 번호 |
| `y` | PDF 좌표계 기준 y 위치 |
| `viewportY` | scale 1 기준 viewport y 위치 |

문항 번호 감지 패턴은 v5와 동일하게 유지한다.

```js
const QUESTION_PATTERN = /^(\d{1,3})[.．]$/;
```

---

## 7. 문항 위치 이동

파일:

- `renderer/js/pdf-viewer.js`
- `renderer/js/answers.js`

문항 선택 시 단순히 페이지를 바꾸는 것이 아니라, 감지된 y좌표로 PDF 패널을 스크롤한다.

```js
async function scrollToPdfY(page, pdfY) {
  if (!scrollContainer || pdfY === undefined || pdfY === null) return;
  const viewport = page.getViewport({ scale });
  const [, viewportY] = viewport.convertToViewportPoint(0, Number(pdfY));
  scrollContainer.scrollTop = Math.max(viewportY - 28, 0);
  scrollContainer.scrollLeft = 0;
}
```

문항 이동 인터페이스:

```js
async goToQuestion(questionNum) {
  const entry = normalizeMapEntry(questionMap[String(questionNum)]);
  if (!entry?.page) return false;
  await renderPage(entry.page, { pdfY: entry.y });
  return true;
}
```

기존 수동 매핑처럼 숫자만 저장된 경우도 호환한다.

```js
function normalizeMapEntry(entry) {
  if (!entry) return null;
  if (typeof entry === 'number') return { page: entry };
  return entry;
}
```

---

## 8. 시험 시작 시 기본 표시

파일:

- `renderer/js/answers.js`

시험 화면 초기화 순서:

1. PDF buffer 로드
2. PDF.js 문서 로드
3. 가로폭 기준으로 `fitToScreen()`
4. 저장된 문항 매핑이 있으면 불러오기
5. 없으면 문항 번호 자동 감지
6. 매핑 상태 UI 갱신
7. `selectQuestion(1)` 호출

이 흐름으로 시험 시작 시 1번 문항 위치가 가능한 한 명확하게 보인다.

```js
const pdf = await pdfViewer.load(pdfBuffer);
if (pdf) {
  await pdfViewer.fitToScreen();
  // savedMap 또는 detectQuestionMap 처리
}
updateMappingStatus();
updateNavigation();
await selectQuestion(1);
```

---

## 9. 렌더링 안정성

파일:

- `renderer/js/pdf-viewer.js`

확대/축소 버튼, 배율 입력, Ctrl+휠은 짧은 시간에 연속 호출될 수 있다. PDF.js 렌더링 중 새 렌더링이 겹치면 취소 예외나 표시 꼬임이 생길 수 있으므로 렌더링 큐를 둔다.

```js
let renderQueue = Promise.resolve();

function renderPage(nextPageNum = pageNum, options = {}) {
  renderQueue = renderQueue
    .catch(() => {})
    .then(() => drawPage(nextPageNum, options));
  return renderQueue;
}
```

기존 렌더 작업이 있으면 취소하고 최신 요청을 순차 처리한다.

---

## 10. 수동 페이지 매핑

수동 페이지 매핑 입력 형식은 v5와 동일하게 유지한다.

```text
1:1
21:3
41:5
```

수동 매핑은 페이지 번호만 저장하므로 문항 y좌표 이동은 지원하지 않는다. 이 경우 문항 클릭 시 해당 페이지 상단으로 이동한다.

자동 감지가 성공한 PDF는 page와 y좌표가 함께 저장되어 문항 시작 위치로 이동한다.

---

## 11. 기록 화면 변경

파일:

- `renderer/history.html`
- `renderer/js/history.js`

기록 화면도 시험 화면과 같은 PDF.js 뷰어 조작을 사용한다.

- 이전/다음 페이지
- 확대/축소 버튼
- 직접 배율 입력
- 화면 맞춤
- Ctrl+마우스 휠 확대/축소

기록 화면은 문항 네비게이션과 문항 y좌표 이동은 제공하지 않는다. 채점 결과 상세와 PDF 확인을 위한 뷰어로 유지한다.

---

## 12. 기존 기능 유지

v5에서 동작하던 다음 기능은 유지한다.

- PDF.js 기반 canvas 렌더링
- PDF 가져오기 / 정답 파일 가져오기
- 정답 편집 화면
- 문항 번호 패널
- 응답 상태 표시
- 검토 표시
- 미응답 문항 이동
- 제출 전 미응답 확인
- 채점 기록 저장
- 번들 데이터 마이그레이션
- Claude 프롬프트 기능
- 빌드 버전 `2.0.0`

---

## 13. 사용 흐름

1. `PDF 가져오기`로 시험지 PDF를 추가한다.
2. `정답 파일 가져오기` 또는 `정답 편집`으로 정답을 등록한다.
3. `시험 시작`을 누르면 PDF.js가 PDF를 렌더링한다.
4. 앱이 문항 번호와 문항 위치를 자동 감지한다.
5. 성공 시 1번 문항 위치로 자동 이동한다.
6. 문항 번호 패널에서 문항을 누르면 해당 문항 위치로 이동한다.
7. PDF가 작거나 크면 다음 방식으로 배율을 조정한다.
   - `+`, `-` 버튼
   - 배율 직접 입력
   - `Ctrl + 마우스 휠`
   - `맞춤`
8. 답안을 선택하면 자동 저장된다.
9. `검토 표시`로 다시 볼 문항을 표시한다.
10. `미응답 이동`으로 안 푼 문항을 확인한다.
11. `오답 체크`를 누르면 미응답 경고 후 채점한다.
12. `기록`에서 날짜별 채점 결과를 확인한다.

---

## 14. 한계와 후속 개선

현재 문항 위치 이동은 PDF 텍스트 레이어가 있는 문서에서 가장 잘 동작한다.

한계:

- 스캔본 PDF는 텍스트 레이어가 없어 문항 y좌표 자동 감지가 불가능하다.
- 수동 매핑은 페이지 번호만 입력하므로 문항 위치가 아닌 페이지 상단으로 이동한다.
- PDF마다 문항 번호 표기 방식이 다르면 감지율이 떨어질 수 있다.

후속 개선 후보:

- 수동 매핑에서 `문항:페이지:y` 입력 지원
- 사용자가 PDF에서 현재 스크롤 위치를 특정 문항에 저장하는 UI
- OCR 기반 스캔본 문항 번호 감지
- 현재 문항 영역 crop 렌더링 또는 문항 단위 보기 모드

