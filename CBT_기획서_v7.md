# CBT 구현 기획서 v7

> 범용 기출문제 CBT - Electron + PWA 동시 제공 기준 기획서

---

## 1. v6 대비 변경 사항 요약

| 구분 | v6 | v7 |
|------|----|----|
| 배포 형태 | Electron 데스크탑 앱 중심 | Electron + PWA 병행 제공 |
| 앱 버전 | `2.0.0` | `3.0.0` |
| 웹 빌드 | 없음 | Vite 기반 PWA 빌드 추가 |
| 브라우저 저장소 | 없음 | IndexedDB 기반 PDF/정답/답안/기록/문항매핑 저장 |
| Electron API | `preload.js`의 `window.electronAPI` | PWA에서도 동일한 `window.electronAPI` 호환 어댑터 제공 |
| 파일 선택 | Electron dialog | PWA에서는 브라우저 file input |
| 오프라인 지원 | Electron 앱 자체 실행 | PWA service worker 캐싱 추가 |
| 앱 설치성 | Electron 설치 파일 | 브라우저 PWA 설치 가능 |
| 빌드 산출물 | `release/` | `release/` + `pwa-dist/` |
| 빌드 명령 | `npm run build` | `build:electron`, `build:pwa`, `dev:pwa`, `preview:pwa` 추가 |
| 설정 파일 | Electron 설정 중심 | `vite.config.js`, `manifest.webmanifest`, `service-worker.js` 추가 |
| PWA 루트 화면 | 구버전 루트 `index.html` 노출 가능 | 루트 `/`를 `renderer/index.html`로 리다이렉트 |
| 기본 PDF 배율 | 화면 맞춤 후 1번 문항 이동 | 화면 맞춤의 약 2배, 한 페이지의 약 1/4 영역을 기본 표시 |
| 시험 목록 액션 | 텍스트 버튼 | 아이콘 버튼 + hover/focus 툴팁 |
| 모바일 시험 화면 | 세로 스택으로 문제/답안 동시 확인 어려움 | iPhone 폭에서도 PDF와 답안을 동시에 보는 압축 2열 레이아웃 |
| 모바일 상단 컨트롤 | 모바일에서 sticky 해제 | 답안 패널 안에서 타이머/채점 컨트롤 sticky 유지 |
| 배포 자동화 | 로컬 빌드 중심 | Vercel 정적 배포 설정 추가 |

---

## 2. 프로젝트 개요

- **목적**: 어떤 과목이든 PDF 기출문제를 데스크탑 또는 브라우저에서 풀 수 있는 개인용 범용 CBT 시스템
- **특징**: 백엔드 없음, 로컬 저장, 광고 없음
- **배포**:
  - Electron 데스크탑 설치 파일
  - PWA 정적 웹 앱
- **기술 스택**:
  - 공통 UI: HTML / CSS / Vanilla JS / PDF.js
  - Electron: Electron / electron-store / electron-builder
  - PWA: Vite / IndexedDB / Service Worker / Web App Manifest
- **주요 기능**:
  - PDF 가져오기 및 시험 목록 관리
  - PDF.js 기반 canvas 직접 렌더링
  - 문항 번호 자동 감지 및 문항 위치 스크롤
  - 문항 번호 패널과 응답 상태 표시
  - 페이지 이동, 확대/축소, 직접 배율 입력, Ctrl+휠 확대/축소
  - 시험 중 답안 자동 저장
  - 검토 표시, 미응답 이동, 제출 전 확인
  - 오답 체크, 점수 표시, 채점 기록 저장
  - Electron/PWA 공통 화면 사용

---

## 3. v7 핵심 방향

v6까지는 Electron 앱 안에서 PDF.js 기반 문항 중심 뷰어를 완성하는 데 초점을 두었다. v7에서는 같은 renderer 화면을 재사용하여 PWA 버전을 추가한다.

핵심 설계는 다음과 같다.

- 화면과 시험 로직은 Electron과 PWA가 공유한다.
- 기존 renderer 코드가 호출하던 `window.electronAPI` 인터페이스를 유지한다.
- Electron에서는 `preload.js`가 `window.electronAPI`를 제공한다.
- PWA에서는 `renderer/js/pwa-api.js`가 같은 이름의 호환 API를 제공한다.
- 저장소 구현만 환경별로 다르게 둔다.
- PWA는 IndexedDB에 PDF, 정답, 답안, 기록, 문항 매핑을 저장한다.
- 모바일 PWA에서도 실제 시험 중 문제와 답안을 한 화면에서 함께 볼 수 있어야 한다.

---

## 4. 파일 구조

```text
project/
├── main.js
├── index.html       # PWA 루트 접속 시 renderer/index.html로 이동
├── preload.js
├── package.json
├── package-lock.json
├── vite.config.js
├── vercel.json
├── installer.nsh
├── files/
│   └── icon.ico
├── public/
│   ├── manifest.webmanifest
│   ├── service-worker.js
│   └── icons/
│       └── icon.svg
├── renderer/
│   ├── index.html
│   ├── exam.html
│   ├── answer-editor.html
│   ├── history.html
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── index.js
│       ├── pwa-api.js
│       ├── pwa-register.js
│       ├── pdf-viewer.js
│       ├── question-detector.js
│       ├── navigation.js
│       ├── answers.js
│       ├── answer-editor.js
│       ├── history.js
│       └── timer.js
├── release/       # Electron 빌드 산출물
└── pwa-dist/      # PWA 빌드 산출물
```

---

## 5. 패키지와 빌드 변경

파일:

- `package.json`
- `package-lock.json`
- `vite.config.js`

### 버전

```json
{
  "version": "3.0.0"
}
```

### scripts

```json
{
  "scripts": {
    "start": "electron .",
    "dev:pwa": "vite --host 0.0.0.0",
    "build": "electron-builder",
    "build:electron": "electron-builder",
    "build:pwa": "vite build",
    "preview:pwa": "vite preview --host 0.0.0.0"
  }
}
```

### dependencies

```json
{
  "dependencies": {
    "electron-store": "^8.2.0",
    "pdfjs-dist": "^4.10.38"
  },
  "devDependencies": {
    "electron": "^30.5.1",
    "electron-builder": "^24.13.3",
    "vite": "^5.4.19"
  }
}
```

### PWA 빌드 산출물

```text
pwa-dist/
```

### Electron 빌드 산출물

```text
release/CBT Setup 3.0.0.exe
```

---

## 6. Vite 설정

파일:

- `vite.config.js`

PWA 빌드는 기존 `renderer` HTML 파일들을 entry로 사용한다.

```js
const { defineConfig } = require('vite');
const { resolve } = require('path');

module.exports = defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'pwa-dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'renderer/index.html'),
        exam: resolve(__dirname, 'renderer/exam.html'),
        answerEditor: resolve(__dirname, 'renderer/answer-editor.html'),
        history: resolve(__dirname, 'renderer/history.html'),
      },
    },
  },
});
```

---

## 7. PWA Manifest

파일:

- `public/manifest.webmanifest`

역할:

- 브라우저 설치 가능 앱 메타데이터 제공
- 시작 URL 지정
- 앱 이름, 색상, 아이콘 지정

핵심 설정:

```json
{
  "name": "CBT",
  "short_name": "CBT",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "background_color": "#f5f6f8",
  "theme_color": "#2563eb"
}
```

---

## 8. Service Worker

파일:

- `public/service-worker.js`
- `renderer/js/pwa-register.js`

역할:

- PWA 앱 shell 캐싱
- 정적 파일 fetch 캐싱
- 새 service worker 활성화 처리

캐시 이름:

```js
const CACHE_NAME = 'cbt-pwa-v3';
```

초기 캐싱 대상:

```js
const APP_SHELL = [
  '/renderer/index.html',
  '/renderer/exam.html',
  '/renderer/answer-editor.html',
  '/renderer/history.html',
  '/manifest.webmanifest'
];
```

등록 스크립트:

```js
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js');
}
```

`file://` 실행에서는 service worker를 등록하지 않는다.

---

## 9. PWA API 어댑터

파일:

- `renderer/js/pwa-api.js`

PWA에서는 Electron의 `preload.js`가 없으므로 브라우저에서 동일한 API 표면을 제공한다.

```js
if (window.electronAPI) return;

window.electronAPI = {
  importPDF,
  importAnswers,
  listPDFs,
  getPDFPath,
  getPDFBuffer,
  deletePDF,
  saveAnswers,
  loadAnswers,
  saveUserAnswers,
  loadUserAnswers,
  saveHistory,
  loadHistory,
  saveQuestionMap,
  loadQuestionMap,
};
```

Electron 환경에서는 이미 `window.electronAPI`가 존재하므로 PWA 어댑터는 아무 작업도 하지 않는다.

---

## 10. PWA 저장소 설계

PWA는 IndexedDB를 사용한다.

DB 이름:

```js
const DB_NAME = 'cbt-pwa';
```

Object store:

| store | 저장 데이터 |
|-------|-------------|
| `pdfs` | PDF 파일명, MIME type, ArrayBuffer |
| `answers` | 정답 JSON |
| `userAnswers` | 사용자 답안과 검토 표시 |
| `history` | 채점 기록 |
| `questionMap` | 문항 번호 → 페이지/y좌표 매핑 |

Electron과 PWA 저장소 대응:

| 데이터 | Electron | PWA |
|--------|----------|-----|
| PDF | `userData/pdfs` | IndexedDB `pdfs` |
| 정답 | `userData/answers` | IndexedDB `answers` |
| 사용자 답안 | electron-store `answers.{examId}` | IndexedDB `userAnswers` |
| 기록 | electron-store `history.{examId}` | IndexedDB `history` |
| 문항 매핑 | electron-store `questionMap.{examId}` | IndexedDB `questionMap` |

---

## 11. PWA 파일 가져오기

Electron:

- `dialog.showOpenDialog`

PWA:

- `<input type="file">`를 동적으로 생성해 파일 선택

PDF 가져오기:

```js
chooseFiles('application/pdf,.pdf', true)
```

정답 파일 가져오기:

```js
chooseFiles('.json,.js,application/json,text/javascript', true)
```

PWA에서는 선택한 PDF를 `ArrayBuffer`로 읽어 IndexedDB에 저장한다.

---

## 12. 정답 파일 파싱 변경

JSON 정답 파일은 Electron과 PWA 모두 동일하게 지원한다.

JavaScript 정답 파일:

```js
var answers = {
  1: 2,
  2: 4,
  3: 1
};
```

Electron에서는 `vm.runInContext`로 `answers` 객체를 읽는다.

PWA에서는 브라우저 보안상 임의 JavaScript 실행을 피하고, `var answers = { ... }` 형태를 문자열로 파싱한다.

```js
const match = /(?:var|let|const)\s+answers\s*=\s*({[\s\S]*?})\s*;?\s*$/.exec(source.trim());
```

숫자 key는 JSON 파싱 가능하도록 문자열 key로 변환한다.

---

## 13. HTML 변경

파일:

- `renderer/index.html`
- `renderer/exam.html`
- `renderer/answer-editor.html`
- `renderer/history.html`

공통 변경:

```html
<link rel="manifest" href="/manifest.webmanifest">
<script type="module" src="js/pwa-api.js"></script>
<script type="module" src="js/pwa-register.js"></script>
```

기존 일반 script는 Vite가 번들링할 수 있도록 `type="module"`로 전환했다.

예:

```html
<script type="module" src="js/index.js"></script>
```

---

## 14. PDF.js 뷰어 유지 사항

v6의 PDF.js 문항 중심 기능은 PWA에서도 그대로 유지한다.

- canvas 직접 렌더링
- PDF worker 사용
- 문항 번호 자동 감지
- 문항 y좌표 기반 스크롤
- 시작 시 1번 문항 이동
- 확대/축소 버튼
- 직접 배율 입력
- Ctrl+마우스 휠 확대/축소
- 렌더링 큐 기반 순차 렌더링

Vite PWA 빌드에서는 PDF.js worker가 번들 산출물로 포함된다.

예:

```text
pwa-dist/assets/pdf.worker.min-*.mjs
```

---

## 15. 사용 흐름

### Electron

1. `npm start` 또는 설치 파일로 실행한다.
2. `PDF 가져오기`로 시험지 PDF를 추가한다.
3. `정답 편집` 또는 `정답 파일 가져오기`로 정답을 등록한다.
4. `시험 시작`을 눌러 풀이한다.
5. `오답 체크`로 채점하고 기록을 저장한다.

### PWA

1. `npm run dev:pwa` 또는 배포된 PWA 주소에 접속한다.
2. 루트 `/`에서 시작하며, 자동으로 `/renderer/index.html` 화면을 사용한다.
3. `PDF 가져오기`로 브라우저 파일 선택창을 연다.
4. PDF와 정답은 IndexedDB에 저장된다.
5. 브라우저 설치 기능으로 PWA 앱처럼 사용할 수 있다.

---

## 16. 빌드와 검증

### PWA 빌드

```bash
npm run build:pwa
```

완료 기준:

- `pwa-dist/` 생성
- HTML entry 4개 생성
- PDF.js worker asset 생성
- 번들 스크립트가 HTML에 연결됨

### Electron 빌드

```bash
npm run build:electron
```

완료 기준:

- `release/CBT Setup 3.0.0.exe` 생성

---

## 17. Vercel 배포

v7 최종 단계에서 PWA를 Vercel 정적 사이트로 배포할 수 있도록 `vercel.json`을 추가한다.

목표:

- 로컬 PC를 켜두지 않아도 앱에 접속 가능
- Git 저장소 push 시 Vercel이 자동 빌드/배포
- Electron 설치판과 별개로 브라우저/PWA 버전 운영

설정 파일:

```text
vercel.json
```

핵심 설정:

```json
{
  "buildCommand": "npm run build:pwa",
  "outputDirectory": "pwa-dist",
  "installCommand": "npm install",
  "framework": null
}
```

Vercel 자동 배포 흐름:

1. 프로젝트를 GitHub/GitLab/Bitbucket 저장소에 push한다.
2. Vercel에서 저장소를 Import한다.
3. Vercel이 `npm install`을 실행한다.
4. Vercel이 `npm run build:pwa`를 실행한다.
5. `pwa-dist/`를 정적 사이트로 배포한다.
6. 이후 main 브랜치 push마다 자동으로 새 배포가 생성된다.

service worker 관련 보강:

- `/`
- `/index.html`
- `/renderer/index.html`
- `/renderer/exam.html`
- `/renderer/answer-editor.html`
- `/renderer/history.html`
- `/manifest.webmanifest`

위 경로를 app shell 캐시 대상으로 둔다.

---

## 18. 한계와 후속 개선

PWA 추가로 생긴 한계:

- PWA 데이터는 브라우저 IndexedDB에 저장되므로 브라우저 데이터 삭제 시 함께 삭제될 수 있다.
- PWA는 로컬 파일 경로를 유지하지 않고 파일 내용을 IndexedDB에 복사한다.
- PWA의 `.js` 정답 파일 파싱은 정해진 `var answers = { ... }` 형식만 안정적으로 지원한다.
- service worker 캐싱은 기본 구현이며, 대규모 PDF 자체를 오프라인 앱 shell 캐시에 넣지는 않는다.

후속 개선 후보:

- PWA 데이터 전체 내보내기/가져오기
- PDF 포함 백업 파일 생성
- PWA 전용 설치 안내 UI
- service worker 캐시 전략 고도화
- PWA 설치 후 시작 URL과 Electron 화면의 UX 일치 유지
- 수동 문항 매핑에서 y좌표 저장 지원
