# CBT 구현 기획서 v4

> 범용 기출문제 CBT - Electron 데스크탑 앱의 현재 구현 기준 기획서

---

## 1. v3 대비 변경 사항 요약

현재 프로젝트를 확인한 결과, `CBT_기획서_v3.md` 이후 다음 내용이 구현 또는 변경되어 v4에 반영한다.

| 구분 | v3 | 현재 구현 / v4 |
|------|----|----------------|
| 화면 구조 | 시험 목록, 시험 화면, 정답 편집 | 채점 기록 화면(`history.html`) 추가 |
| 정답 입력 | 정답 편집 화면에서 직접 입력 | `.json`, `.js` 정답 파일 가져오기 기능 추가 |
| 채점 결과 | 화면에 점수와 오답 표시 | 채점 시 기록을 저장하고 기록 화면에서 재확인 가능 |
| 시작 안내 | 문서상 사용 방법 중심 | 앱 첫 실행 시 사용 방법 다이얼로그 표시, `앞으로 보지 않기` 지원 |
| Claude 활용 | 숫자 나열 추출 프롬프트 | 앱에서 `.js` 정답 파일 생성용 프롬프트 제공 및 복사 지원 |
| 번들 데이터 | 별도 언급 없음 | 앱 내부 `pdfs/`, `answers/` 번들 데이터를 userData로 마이그레이션 |
| 삭제 처리 | PDF와 정답 삭제 | 사용자 답안, 채점 기록 삭제 및 번들 시험 삭제 상태 저장 |
| PDF 표시 | `<iframe src="file:///...">` | 현재도 renderer의 `<iframe id="pdf-frame">`에 file URL을 넣는 방식 |
| 패키징 | 기본 electron-builder | Windows 아이콘, NSIS include, `release` 출력 디렉터리 반영 |

---

## 2. 프로젝트 개요

- **목적**: 어떤 과목이든 PDF 기출문제를 데스크탑에서 풀 수 있는 개인용 범용 CBT 시스템
- **특징**: 백엔드 없음, Electron 단독 실행, 광고 없음
- **배포**: Electron 패키징(`electron-builder`)
- **기술 스택**: Electron / HTML / CSS / Vanilla JS / electron-store
- **주요 기능**:
  - PDF 가져오기 및 시험 목록 관리
  - PDF와 연결되는 정답 직접 편집
  - JSON 또는 JavaScript 정답 파일 가져오기
  - 시험 중 답안 자동 저장
  - 오답 체크, 점수 표시, 오답 문항 표시
  - 채점 기록 저장 및 상세 확인
  - 시작 가이드와 Claude 프롬프트 복사

---

## 3. 현재 파일 구조

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
│       ├── answers.js
│       ├── answer-editor.js
│       ├── history.js
│       └── timer.js
└── (런타임) app.getPath('userData')/
    ├── pdfs/
    └── answers/
```

루트의 `index.html`, `exam.html`, `css/`, `js/`는 구버전 또는 보조 파일로 보이며, 현재 Electron 진입점은 `renderer/index.html`이다.

---

## 4. Electron 메인 프로세스

### 저장소

- `userData/pdfs/`: 사용자가 가져온 PDF 파일 저장
- `userData/answers/`: 정답 JSON 파일 저장
- `electron-store`:
  - `answers.{examId}`: 사용자 답안 자동 저장
  - `history.{examId}`: 채점 기록 저장
  - `deletedBundledExams`: 번들 시험 삭제 상태 저장

### IPC 채널

| 채널 | 설명 |
|------|------|
| `pdf:import` | PDF 파일 선택 후 `userData/pdfs/`로 복사 |
| `pdf:list` | 등록된 PDF 목록 반환 |
| `pdf:getPath` | PDF 파일의 `file://` URL 반환 |
| `pdf:delete` | PDF, 정답, 사용자 답안, 채점 기록 삭제 |
| `answers:import` | `.json`, `.js` 정답 파일 가져오기 |
| `answers:save` | 정답 JSON 저장 |
| `answers:load` | 정답 JSON 로드 |
| `userAnswers:save` | 풀이 중 사용자 답안 저장 |
| `userAnswers:load` | 저장된 사용자 답안 로드 |
| `history:save` | 채점 결과 기록 저장 |
| `history:load` | 채점 기록 목록 로드 |

### 번들 데이터 마이그레이션

앱 내부에 `pdfs/`, `answers/` 폴더가 있으면 실행 시 `userData`로 복사한다.

- 번들 PDF는 `userData/pdfs/`에 없을 때만 복사
- 번들 정답 `.js`는 `var answers = { ... }` 형식으로 읽어 JSON 정답 파일로 변환
- 사용자가 삭제한 번들 시험은 `deletedBundledExams`에 기록하여 재실행 시 다시 복사하지 않음

---

## 5. preload.js

renderer에는 `window.electronAPI`를 노출한다.

```js
window.electronAPI.importPDF()
window.electronAPI.importAnswers()
window.electronAPI.listPDFs()
window.electronAPI.getPDFPath(examId)
window.electronAPI.deletePDF(examId)
window.electronAPI.saveAnswers(examId, data)
window.electronAPI.loadAnswers(examId)
window.electronAPI.saveUserAnswers(examId, data)
window.electronAPI.loadUserAnswers(examId)
window.electronAPI.saveHistory(examId, data)
window.electronAPI.loadHistory(examId)
```

---

## 6. 정답 파일 형식

정답 파일 경로:

```text
userData/answers/{examId}.json
```

형식:

```json
{
  "label": "2024년 정보처리기사 1회",
  "questionCount": 100,
  "answers": {
    "1": 2,
    "2": 4,
    "3": 1
  }
}
```

정답 가져오기는 두 형식을 지원한다.

### JSON

- 전체 객체가 위 형식이면 그대로 사용
- 단순 `{ "1": 2, "2": 4 }` 형식이면 `answers`로 감싸서 저장

### JavaScript

```js
var answers = {
  1: 2,
  2: 4,
  3: 1
};
```

파일명은 PDF 파일명과 같아야 연결된다.

예:

```text
2025_1.pdf
2025_1.js
```

---

## 7. 시험 목록 화면

파일:

- `renderer/index.html`
- `renderer/js/index.js`

기능:

- PDF 가져오기
- 정답 파일 가져오기
- 시험 시작
- 정답 편집
- 채점 기록 보기
- PDF 및 연결 데이터 삭제
- 사용 방법 다이얼로그 표시
- Claude 프롬프트 보기 및 복사
- `localStorage.hide-start-guide`로 시작 가이드 숨김 상태 저장

목록 표시는 `pdf:list` 결과를 기준으로 하고, `answers/{examId}.json`의 `label`이 있으면 해당 이름을 표시한다.

---

## 8. 정답 편집 화면

파일:

- `renderer/answer-editor.html`
- `renderer/js/answer-editor.js`

역할:

- PDF별 표시 이름 입력
- 정답 번호를 숫자 나열로 입력
- 입력된 숫자 수만큼 문항 자동 생성
- 각 문항 버튼 클릭으로 개별 수정
- 저장 시 `answers/{examId}.json` 생성 또는 갱신

입력 구분자:

- 스페이스
- 줄바꿈
- 쉼표

유효한 정답 값:

- `1`, `2`, `3`, `4`

---

## 9. 시험 화면

파일:

- `renderer/exam.html`
- `renderer/js/answers.js`
- `renderer/js/timer.js`

레이아웃:

```text
[ PDF iframe 영역 ] | [ 타이머 / 채점 / 답안 사이드바 ]
```

동작:

- `pdf:getPath`로 PDF file URL을 받아 `<iframe id="pdf-frame">`에 설정
- 정답 파일이 있으면 `questionCount`만큼 답안 행 생성
- 정답 파일이 없으면 기본 100문항 생성
- 답안 버튼 클릭 시 `electron-store`에 즉시 저장
- 다시 시험 화면에 들어오면 기존 답안 복원
- 오답 체크 시 점수, 오답 번호, 정답 마킹 표시
- 채점 결과를 `history:{examId}`에 저장

현재 PDF 표시 방식:

```html
<iframe id="pdf-frame" title="기출문제 PDF"></iframe>
```

```js
const pdfPath = await window.electronAPI.getPDFPath(examId);
if (pdfPath) pdfFrame.src = pdfPath;
```

즉, 현재는 PDF.js canvas 렌더링이 아니라 Electron/Chromium 내장 PDF 표시 기능에 맡기는 iframe 방식이다.

---

## 10. 채점 기록 화면

파일:

- `renderer/history.html`
- `renderer/js/history.js`

역할:

- 특정 시험의 채점 기록 목록 표시
- 기록 선택 시 점수, 정답률, 오답 수, 오답 문항 표시
- 기록 당시의 사용자 답안과 정답을 문항별로 표시
- PDF를 함께 iframe으로 표시

저장되는 기록 형식:

```json
{
  "id": "timestamp",
  "score": 85,
  "total": 100,
  "wrong": [3, 17, 42],
  "userAnswers": { "1": 2 },
  "correctAnswers": { "1": 2 },
  "checkedAt": "2026-05-20T00:00:00.000Z"
}
```

기록은 최신 채점 결과가 앞에 오도록 저장된다.

---

## 11. 타이머

파일:

- `renderer/js/timer.js`

동작:

- 시험 화면 진입 시 0초부터 카운트업
- 제한 시간은 9000초, 즉 150분
- 제한 시간 이내: `진행 중`, `HH:MM:SS`
- 제한 시간 초과: `시험 종료`, 기준 시간은 `02:30:00`으로 고정 표시하고 초과 시간은 `+HH:MM:SS`로 별도 표시

---

## 12. Claude 프롬프트 기능

시작 가이드에서 `프롬프트 보기`를 누르면 Claude에 PDF를 첨부해 정답 파일을 만들기 위한 프롬프트를 보여준다.

현재 프롬프트는 숫자 나열이 아니라 앱에서 바로 가져올 수 있는 JavaScript 파일 형식을 요구한다.

요구 출력 예:

```js
var answers = {
  1: 2,
  2: 4,
  3: 1
};
```

이 파일을 PDF와 같은 이름으로 저장한 뒤 `정답 파일 가져오기`로 불러오는 흐름을 권장한다.

---

## 13. 패키징

현재 `package.json` 기준:

```json
{
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "build": "electron-builder"
  },
  "dependencies": {
    "electron-store": "^8.2.0"
  },
  "devDependencies": {
    "electron": "^30.5.1",
    "electron-builder": "^24.13.3"
  },
  "build": {
    "appId": "local.cbt.app",
    "productName": "CBT",
    "directories": {
      "output": "release"
    },
    "files": [
      "main.js",
      "preload.js",
      "renderer/**/*",
      "files/**/*"
    ],
    "win": {
      "target": "nsis",
      "icon": "files/icon.ico"
    },
    "nsis": {
      "include": "installer.nsh"
    },
    "mac": {
      "target": "dmg"
    }
  }
}
```

---

## 14. 사용 흐름

### 직접 정답 입력

1. `PDF 가져오기`로 시험지 PDF를 추가한다.
2. 목록에서 `정답 편집`을 누른다.
3. 표시 이름을 입력한다.
4. 정답 번호를 순서대로 입력한다.
5. 저장 후 목록으로 돌아간다.
6. `시험 시작`을 눌러 풀이한다.
7. `오답 체크`로 점수와 오답을 확인한다.
8. 이후 `기록`에서 이전 채점 결과를 확인한다.

### 정답 파일 가져오기

1. PDF와 같은 이름의 `.json` 또는 `.js` 정답 파일을 준비한다.
2. `정답 파일 가져오기`를 누른다.
3. 파일을 선택하면 `userData/answers/{examId}.json`으로 저장된다.
4. 목록에서 시험을 시작한다.

---

## 15. PDF.js 연동 검토 질문

Electron 환경이라 `pdfjs-dist`를 메인 프로세스나 렌더러 어느 쪽에서 돌릴지, 그리고 현재 PDF 뷰어가 어떤 방식인지(canvas 렌더링인지 iframe인지)에 따라 구체적인 연동 방법이 달라집니다.

현재 PDF 표시는 어떻게 구현되어 있나요?

현재 프로젝트 기준 답변:

- PDF 표시는 renderer 화면의 `<iframe id="pdf-frame">`에 `file://` URL을 넣는 방식이다.
- `main.js`의 `pdf:getPath` IPC가 `pathToFileURL(pdfPath).toString()`을 반환한다.
- `renderer/js/answers.js`, `renderer/js/history.js`가 이 값을 받아 `pdfFrame.src = pdfPath`로 설정한다.
- 따라서 현재는 `pdfjs-dist`를 사용한 canvas 렌더링 방식이 아니다.

향후 PDF.js를 도입하려면 우선 다음을 결정해야 한다.

- 기존 iframe 방식을 유지하고 일부 기능만 보강할지
- PDF 표시 전체를 renderer의 PDF.js canvas 렌더링으로 교체할지
- 페이지 이동, 확대/축소, 검색, 하이라이트, OCR 연계 중 어떤 기능이 필요한지
- PDF 파일 접근을 renderer에서 직접 할지, main IPC를 통해 ArrayBuffer 또는 임시 URL로 전달할지

현재 구조에서는 PDF 뷰어 기능을 확장하려면 renderer에서 `pdfjs-dist`를 사용하는 방식이 가장 자연스럽다. 다만 Electron 보안 설정, worker 파일 경로, 로컬 파일 접근 정책을 함께 조정해야 한다.

