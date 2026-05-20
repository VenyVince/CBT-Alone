# CBT 구현 기획서 v5

> 범용 기출문제 CBT - Electron 데스크탑 앱의 현재 구현 기준 기획서

---

## 1. v4 대비 변경 사항 요약

| 구분 | v4 | v5 |
|------|----|----|
| PDF 표시 방식 | `<iframe>` + Chromium 내장 PDF 뷰어 | `pdfjs-dist` 기반 canvas 직접 렌더링으로 전면 교체 |
| 페이지 제어 | 불가 | 페이지 이동, 확대/축소, 현재 페이지 표시 |
| 문항 네비게이션 | 없음 | 문항 번호 패널 추가, 응답 상태 시각화 |
| 문항 ↔ 페이지 연동 | 없음 | 자동 감지 + 상태 관리 + 수동 보정 UI |
| 제출 확인 | 없음 | 미응답 문항 경고 후 제출 |
| 검토 표시 | 없음 | 문항별 검토 표시 기능 추가 |
| 미응답 이동 | 없음 | 미응답 문항만 순차 이동 기능 추가 |

---

## 2. 프로젝트 개요

- **목적**: 어떤 과목이든 PDF 기출문제를 데스크탑에서 풀 수 있는 개인용 범용 CBT 시스템
- **특징**: 백엔드 없음, Electron 단독 실행, 광고 없음
- **배포**: Electron 패키징(`electron-builder`)
- **기술 스택**: Electron / HTML / CSS / Vanilla JS / electron-store / pdfjs-dist
- **주요 기능**:
  - PDF 가져오기 및 시험 목록 관리
  - PDF.js 기반 직접 렌더링 (iframe 제거)
  - 문항 번호 자동 감지 및 페이지 연동
  - 문항 번호 패널 (응답 상태, 검토 표시)
  - 페이지 이동 제어 및 확대/축소
  - 시험 중 답안 자동 저장
  - 미응답 문항 이동, 제출 전 확인
  - 오답 체크, 점수 표시, 채점 기록 저장

---

## 3. 파일 구조

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
│   ├── exam.html              ← iframe 제거, canvas 뷰어 레이아웃으로 교체
│   ├── answer-editor.html
│   ├── history.html           ← iframe 제거, PDF.js 뷰어로 교체
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── index.js
│       ├── pdf-viewer.js      ← 신규: PDF.js 렌더링, 페이지 이동, 줌
│       ├── question-detector.js  ← 신규: 문항 번호 자동 감지, 상태 관리
│       ├── navigation.js      ← 신규: 문항 번호 패널 UI, 응답 상태 표시
│       ├── answers.js         ← PDF.js 연동, 기존 답안 로직 유지
│       ├── answer-editor.js
│       ├── history.js         ← PDF.js 뷰어로 교체
│       └── timer.js
└── (런타임) app.getPath('userData')/
    ├── pdfs/
    └── answers/
```

---

## 4. 시험 화면 레이아웃

```text
┌──────────────────────────────────────────────┐
│  문항 번호 네비게이션 패널                    │
│  [ 1][ 2][ 3][ 4][ 5][ 6][ 7][ 8][ 9][10]  │
│  [11][12][13][14][15][16][17][18][19][20]  ...│
├──────────────────────┬───────────────────────┤
│                      │ 타이머                │
│  PDF.js 렌더링 영역  │ 00:45:12              │
│                      ├───────────────────────┤
│  (현재 문항 기준     │ 현재 문항 답안 선택   │
│   페이지 표시)       │ ① ② ③ ④             │
│                      ├───────────────────────┤
│                      │ [ 검토 표시 ]         │
│                      │ [ ◀ 이전 ] [ 다음 ▶ ]│
├──────────────────────┴───────────────────────┤
│ 17 / 42 page  [−] [+] [맞춤]  [미응답만 보기]│
│                              [ 오답 체크 ]    │
└──────────────────────────────────────────────┘
```

---

## 5. Electron 메인 프로세스 변경

### 추가 IPC 채널

| 채널 | 설명 |
|------|------|
| `pdf:getBuffer` | PDF 파일을 ArrayBuffer로 반환 (PDF.js용) |

기존 IPC 채널은 모두 유지한다.

### main.js 추가 내용

```js
ipcMain.handle('pdf:getBuffer', async (event, examId) => {
  const pdfPath = path.join(userDataPdfsDir, `${examId}.pdf`);
  return fs.readFileSync(pdfPath); // Buffer → renderer에서 ArrayBuffer로 수신
});
```

### preload.js 추가 내용

```js
getPDFBuffer: (examId) => ipcRenderer.invoke('pdf:getBuffer', examId),
```

---

## 6. PDF.js 도입

### 설치

```bash
npm install pdfjs-dist
```

### package.json files 항목 추가

```json
"files": [
  "main.js",
  "preload.js",
  "renderer/**/*",
  "files/**/*",
  "node_modules/pdfjs-dist/build/pdf.min.mjs",
  "node_modules/pdfjs-dist/build/pdf.worker.min.mjs"
]
```

### worker 경로 설정 (Electron 환경)

```js
// renderer/js/pdf-viewer.js
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc =
  require('path').join(
    require('electron').ipcRenderer
      ? window.electronAPI.getAppPath()
      : '',
    'node_modules/pdfjs-dist/build/pdf.worker.min.mjs'
  );
```

---

## 7. 문항 번호 자동 감지 (question-detector.js)

### 감지 전략

PDF.js로 각 페이지의 텍스트 레이어를 스캔하여 문항 번호 패턴(`숫자.`)이 처음 등장하는 페이지를 기록한다.

```js
// 감지 패턴: "1." "12." "100." 형태만 허용
// 보기 번호 ①②③④ 및 문장 내 숫자는 제외
const QUESTION_PATTERN = /^(\d{1,3})[.．]$/;
```

### 감지 상태 구조

감지 결과는 항상 명시적인 상태값과 함께 관리한다. 조용한 비활성화는 하지 않는다.

```js
const mappingState = {
  status: 'idle' | 'scanning' | 'success' | 'partial' | 'failed',
  map: {
    // 문항번호 → PDF 페이지번호
    // 예: { 1: 1, 2: 1, 3: 2, 21: 3 }
  },
  detectedCount: 0,       // 감지된 문항 수
  expectedCount: 100,     // 정답 파일의 questionCount 기준
  failedQuestions: [],    // 감지 실패한 문항 번호 목록
  isManuallyOverridden: false  // 수동 보정 여부
};
```

### 상태별 UI 처리

| 상태 | 문항 클릭 동작 | UI 표시 |
|------|---------------|---------|
| `idle` / `scanning` | 비활성화 | 로딩 인디케이터 |
| `success` | 해당 페이지로 이동 | 정상 |
| `partial` | 감지된 문항만 이동, 나머지는 토스트 메시지 | 경고 배지 표시 |
| `failed` | 페이지 이동 버튼 숨김, 이유 표시 | 안내 메시지 + 수동 보정 버튼 |

`partial`, `failed` 상태에서는 반드시 사용자에게 이유를 알려야 한다. 조용히 기능만 끄는 처리는 하지 않는다.

### 감지 실패 원인 분류

```js
const FAIL_REASONS = {
  NO_TEXT_LAYER: '텍스트 레이어가 없는 PDF입니다 (스캔본)',
  LOW_DETECTION:  '문항 번호를 충분히 감지하지 못했습니다',
  MISMATCH:       '감지된 문항 수가 정답 파일과 맞지 않습니다',
};
```

---

## 8. 수동 보정 UI

자동 감지가 `partial` 또는 `failed` 상태일 때 사용자가 직접 매핑을 입력할 수 있다.

### 보정 진입 방법

- 감지 실패 안내 메시지의 `직접 입력` 버튼
- 시험 화면 하단 `페이지 매핑 편집` 버튼

### 보정 UI 구조

```text
┌────────────────────────────────┐
│ 문항 번호  →  PDF 페이지       │
│  1번       [  1  ]             │
│  21번      [  3  ]             │
│  41번      [  5  ]             │
│  ...                           │
│ [ 자동 재감지 ]  [ 저장 ]      │
└────────────────────────────────┘
```

### 보정 데이터 저장

수동 보정 결과는 `electron-store`에 저장하여 다음 실행 시 재사용한다.

```js
// electron-store 키: questionMap.{examId}
{
  map: { 1: 1, 21: 3, 41: 5, ... },
  isManuallyOverridden: true,
  savedAt: "2026-05-20T00:00:00.000Z"
}
```

---

## 9. 문항 번호 네비게이션 패널 (navigation.js)

### 문항 상태 종류

| 상태 | 색상 | 설명 |
|------|------|------|
| 미응답 | 기본 (회색) | 아직 답을 선택하지 않음 |
| 응답 완료 | 파란색 | 답을 선택함 |
| 검토 표시 | 주황색 | 사용자가 검토 표시를 붙임 |
| 현재 문항 | 진한 파란색 테두리 | 현재 보고 있는 문항 |
| 채점 후 정답 | 초록색 | 채점 결과 정답 |
| 채점 후 오답 | 빨간색 | 채점 결과 오답 |

### 검토 표시 기능

```js
// 문항별 검토 상태는 userAnswers와 함께 electron-store에 저장
{
  answers: { "1": 2, "3": 4 },
  reviews: { "5": true, "12": true }  // 검토 표시된 문항
}
```

---

## 10. PDF.js 뷰어 기능 (pdf-viewer.js)

### 주요 기능

- canvas 렌더링 (`<canvas id="pdf-canvas">`)
- 페이지 이동 (이전/다음/특정 페이지)
- 확대/축소 (`scale += 0.1`)
- 화면 맞춤 (viewport 기준 자동 scale 계산)
- 현재 페이지 표시 (`17 / 42 page`)

### 인터페이스

```js
const pdfViewer = {
  load(arrayBuffer),           // PDF 로드
  goToPage(pageNum),           // 특정 페이지 이동
  goToQuestion(questionNum),   // 문항 번호로 페이지 이동 (mappingState 참조)
  zoomIn(),
  zoomOut(),
  fitToScreen(),
  getCurrentPage(),            // 현재 페이지 번호 반환
  getTotalPages(),             // 전체 페이지 수 반환
};
```

---

## 11. 미응답 이동 및 제출 확인

### 미응답만 보기

```js
// 응답하지 않은 문항 번호만 필터링하여 순차 이동
function goToNextUnanswered() {
  const unanswered = getAllQuestions().filter(n => !userAnswers[n]);
  if (unanswered.length === 0) return;
  goToQuestion(unanswered[0]);
}
```

### 제출 전 확인 다이얼로그

```text
미응답 7문항이 있습니다. (5, 12, 23, 34, 56, 78, 91번)
제출하시겠습니까?

[ 미응답 확인하기 ]  [ 제출 ]
```

---

## 12. 기존 기능 유지

v4에서 동작하던 다음 기능은 변경 없이 유지한다.

- IPC 채널 (`pdf:import`, `pdf:list`, `answers:save`, `userAnswers:save`, `history:save` 등)
- electron-store 기반 답안 자동 저장 및 복원
- 정답 편집 화면 (`answer-editor.html`)
- 채점 기록 화면 (`history.html`) — PDF 표시만 PDF.js로 교체
- 타이머 (`timer.js`)
- 번들 데이터 마이그레이션
- Claude 프롬프트 기능
- 시작 가이드 다이얼로그

---

## 13. 구현 단계

### 1단계: PDF.js 기반 렌더링 전환

**목표**: iframe을 제거하고 PDF.js canvas 렌더링으로 교체한다.

변경 파일:
- `exam.html` — iframe 제거, canvas 뷰어 레이아웃 추가
- `renderer/js/pdf-viewer.js` — 신규 작성
- `renderer/js/answers.js` — `pdfFrame.src` → `pdfViewer.load()` 교체
- `history.html`, `history.js` — 동일하게 교체
- `main.js` — `pdf:getBuffer` IPC 추가
- `preload.js` — `getPDFBuffer` 추가
- `package.json` — `pdfjs-dist` 추가, worker 파일 경로 포함

완료 기준:
- PDF가 canvas에 정상 렌더링됨
- 페이지 이동, 확대/축소 동작
- 기존 답안 자동 저장/복원 정상 동작

---

### 2단계: 문항 번호 자동 감지 및 상태 관리

**목표**: PDF 로드 시 문항 번호 위치를 자동으로 감지하고 상태를 명시적으로 관리한다.

신규 파일:
- `renderer/js/question-detector.js`

완료 기준:
- 텍스트 레이어 있는 PDF에서 문항 번호 감지 성공
- `success` / `partial` / `failed` 상태 구분 정상 동작
- 실패 시 사용자에게 이유 표시 (조용한 비활성화 없음)

---

### 3단계: 문항 네비게이션 UI 및 페이지 연동

**목표**: 문항 번호 패널을 추가하고 클릭 시 해당 페이지로 이동한다.

신규 파일:
- `renderer/js/navigation.js`

완료 기준:
- 문항 번호 패널에 응답 상태 표시
- 문항 클릭 → 해당 페이지 이동 (감지 성공 시)
- 검토 표시 기능 동작
- 수동 보정 UI 진입 및 저장 동작

---

### 4단계: 실전 CBT 기능 강화

**목표**: 실제 기사 CBT와 유사한 UX를 완성한다.

완료 기준:
- 미응답만 보기 기능 동작
- 제출 전 미응답 문항 수 및 번호 확인 다이얼로그
- 진행률 표시 (응답 완료 문항 수 / 전체)
- 채점 기록 화면에서도 PDF.js 뷰어 정상 동작

---

## 14. 패키징 변경 사항

```json
{
  "dependencies": {
    "electron-store": "^8.2.0",
    "pdfjs-dist": "^4.x.x"
  },
  "build": {
    "files": [
      "main.js",
      "preload.js",
      "renderer/**/*",
      "files/**/*",
      "node_modules/pdfjs-dist/build/pdf.min.mjs",
      "node_modules/pdfjs-dist/build/pdf.worker.min.mjs"
    ]
  }
}
```

---

## 15. 사용 흐름 (변경 후)

1. `PDF 가져오기`로 시험지 PDF를 추가한다.
2. `정답 파일 가져오기` 또는 `정답 편집`으로 정답을 등록한다.
3. `시험 시작`을 누르면 PDF.js가 PDF를 렌더링한다.
4. 앱이 문항 번호를 자동 감지한다.
   - 성공 시: 문항 클릭 → 해당 페이지 자동 이동
   - 실패 시: 안내 메시지 표시 → 수동 보정 입력 가능
5. 문항 번호 패널에서 응답 상태를 확인하며 풀이한다.
6. `검토 표시`로 나중에 다시 볼 문항을 표시한다.
7. `미응답만 보기`로 안 푼 문항을 확인한다.
8. `오답 체크`를 누르면 미응답 경고 후 채점한다.
9. `기록`에서 날짜별 채점 결과를 확인한다.
