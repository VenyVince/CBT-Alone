# CBT 구현 기획서 v3

> 범용 기출문제 CBT — Electron 데스크탑 앱, AI가 바로 구현에 들어갈 수 있도록 작성된 기술 기획서

---

## 1. 프로젝트 개요

- **목적**: 어떤 과목이든 PDF 기출문제를 데스크탑에서 풀 수 있는 개인용 범용 CBT 시스템
- **특징**: 백엔드 없음, Electron 단독 실행, 광고 없음
- **배포**: Electron 패키징 (electron-builder, Windows/macOS/Linux)
- **기술 스택**: Electron / HTML / CSS / Vanilla JS / electron-store
- **핵심 기능**:
  - 어떤 PDF든 업로드해서 바로 사용
  - 정답을 숫자 나열로 입력하면 문항 자동 생성
  - 오답 체크 및 점수 확인

---

## 2. 파일 구조

```
project/
├── main.js                 # Electron 메인 프로세스
├── preload.js              # contextBridge IPC 브릿지
├── package.json
├── renderer/
│   ├── index.html          # 시험 선택 화면
│   ├── exam.html           # 시험 화면
│   ├── answer-editor.html  # 정답 편집 화면
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── timer.js        # 타이머 로직
│       └── answers.js      # 채점 로직
└── (런타임) app.getPath('userData')/
    ├── pdfs/               # 사용자가 업로드한 PDF 복사본
    └── answers/            # 정답 JSON 파일
```

---

## 3. Electron 메인 프로세스 (main.js)

### IPC 채널 목록

| 채널 | 방향 | 설명 |
|------|------|------|
| `pdf:import` | renderer → main | 파일 선택 다이얼로그 + `user-data/pdfs/`로 복사 |
| `pdf:list` | renderer → main | `user-data/pdfs/` 내 파일 목록 반환 |
| `pdf:delete` | renderer → main | 지정 PDF 및 연결된 정답 파일 삭제 |
| `answers:save` | renderer → main | 정답 JSON 저장 |
| `answers:load` | renderer → main | 정답 JSON 로드 |
| `userAnswers:save` | renderer → main | 사용자 풀이 저장 |
| `userAnswers:load` | renderer → main | 사용자 풀이 불러오기 |

### 구현 예시

```js
// main.js
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');

const userDataPath = app.getPath('userData');
const pdfsDir    = path.join(userDataPath, 'pdfs');
const answersDir = path.join(userDataPath, 'answers');
fs.mkdirSync(pdfsDir,    { recursive: true });
fs.mkdirSync(answersDir, { recursive: true });

// PDF 가져오기
ipcMain.handle('pdf:import', async () => {
  const { filePaths } = await dialog.showOpenDialog({
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
    properties: ['openFile', 'multiSelections']
  });
  const results = [];
  for (const src of filePaths) {
    const name = path.basename(src);
    const dest = path.join(pdfsDir, name);
    fs.copyFileSync(src, dest);
    results.push(name);
  }
  return results;
});

// PDF 목록
ipcMain.handle('pdf:list', () =>
  fs.readdirSync(pdfsDir).filter(f => f.endsWith('.pdf'))
);

// PDF 삭제
ipcMain.handle('pdf:delete', (_, examId) => {
  const pdfPath = path.join(pdfsDir, `${examId}.pdf`);
  const ansPath = path.join(answersDir, `${examId}.json`);
  if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
  if (fs.existsSync(ansPath)) fs.unlinkSync(ansPath);
  return true;
});

// 정답 저장
ipcMain.handle('answers:save', (_, examId, answersObj) => {
  const dest = path.join(answersDir, `${examId}.json`);
  fs.writeFileSync(dest, JSON.stringify(answersObj, null, 2));
  return true;
});

// 정답 로드
ipcMain.handle('answers:load', (_, examId) => {
  const src = path.join(answersDir, `${examId}.json`);
  if (!fs.existsSync(src)) return null;
  return JSON.parse(fs.readFileSync(src, 'utf-8'));
});

// 사용자 풀이 저장/로드는 electron-store 사용
```

---

## 4. preload.js (contextBridge)

```js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  importPDF:       ()             => ipcRenderer.invoke('pdf:import'),
  listPDFs:        ()             => ipcRenderer.invoke('pdf:list'),
  deletePDF:       (examId)       => ipcRenderer.invoke('pdf:delete', examId),
  saveAnswers:     (examId, data) => ipcRenderer.invoke('answers:save', examId, data),
  loadAnswers:     (examId)       => ipcRenderer.invoke('answers:load', examId),
  saveUserAnswers: (examId, data) => ipcRenderer.invoke('userAnswers:save', examId, data),
  loadUserAnswers: (examId)       => ipcRenderer.invoke('userAnswers:load', examId),
  getPDFPath:      (examId)       => ipcRenderer.invoke('pdf:getPath', examId),
});
```

---

## 5. 정답 파일 형식

파일 경로: `user-data/answers/{examId}.json`

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

- `label`: 사용자가 입력한 표시 이름 (파일명 대신 목록에 표시)
- `questionCount`: 정답 입력 완료 후 자동 산출 (`Object.keys(answers).length`)
- `answers`: key 문자열(문제 번호), value 숫자 1~4

---

## 6. answer-editor.html — 정답 편집 화면

### 역할

PDF별 정답을 숫자 나열로 빠르게 입력하고 저장하는 전용 화면

### 진입 방법

`index.html`에서 각 항목 옆 **정답 편집** 버튼 클릭 → `answer-editor.html?exam=2024_1`

### 핵심 UX: 숫자 입력 → 문항 자동 생성

정답 입력창에 `2 4 1 3 2 ...` 형태로 숫자를 입력하면 실시간으로 문항 행이 생성됨.

```
정답 입력 (숫자를 스페이스/줄바꿈으로 구분):
┌─────────────────────────────┐
│ 2 4 1 3 2 1 4 3 2 1         │
│ 3 2 4 1 ...                 │
└─────────────────────────────┘

↓ 실시간 반영

 1번  ①②③④  →  ② 선택됨
 2번  ①②③④  →  ④ 선택됨
 3번  ①②③④  →  ① 선택됨
 ...
```

버튼 클릭으로도 개별 수정 가능.

### 구현 핵심

```js
// answer-editor.html <script>
const params = new URLSearchParams(location.search);
const examId = params.get('exam');

// 텍스트 입력 → 실시간 문항 렌더링
document.getElementById('raw-input').addEventListener('input', (e) => {
  const nums = e.target.value
    .split(/[\s,]+/)           // 스페이스, 줄바꿈, 쉼표 모두 구분자로 허용
    .map(Number)
    .filter(n => n >= 1 && n <= 4);

  renderRows(nums.length);
  nums.forEach((v, i) => {
    const row = document.querySelector(`.question-row[data-q="${i + 1}"]`);
    if (!row) return;
    row.querySelectorAll('button').forEach(b => b.classList.remove('selected'));
    row.querySelector(`button[data-v="${v}"]`)?.classList.add('selected');
  });
});

function renderRows(count) {
  const container = document.getElementById('answer-container');
  // 현재보다 많으면 추가, 적으면 제거
  const current = container.querySelectorAll('.question-row').length;
  for (let q = current + 1; q <= count; q++) {
    container.insertAdjacentHTML('beforeend', `
      <div class="question-row" data-q="${q}">
        <span class="q-num">${q}번</span>
        <button data-v="1">①</button>
        <button data-v="2">②</button>
        <button data-v="3">③</button>
        <button data-v="4">④</button>
      </div>
    `);
  }
  while (container.querySelectorAll('.question-row').length > count) {
    container.lastElementChild.remove();
  }
}

// 저장
async function save() {
  const rows = document.querySelectorAll('.question-row');
  const answers = {};
  rows.forEach(row => {
    const sel = row.querySelector('button.selected');
    if (sel) answers[row.dataset.q] = Number(sel.dataset.v);
  });
  const label = document.getElementById('label-input').value || examId;
  await window.electronAPI.saveAnswers(examId, {
    label,
    questionCount: rows.length,
    answers
  });
  alert('저장 완료');
}

// 기존 정답 불러오기
async function init() {
  const saved = await window.electronAPI.loadAnswers(examId);
  if (!saved) return;

  document.getElementById('label-input').value = saved.label || '';

  // raw-input 복원
  const nums = Array.from({ length: saved.questionCount }, (_, i) =>
    saved.answers[String(i + 1)] ?? ''
  );
  document.getElementById('raw-input').value = nums.join(' ');
  document.getElementById('raw-input').dispatchEvent(new Event('input'));
}

init();
```

### UI 구성

```
[← 돌아가기]

표시 이름: [2024년 정보처리기사 1회        ]

정답 입력 (1~4 숫자, 스페이스/줄바꿈/쉼표로 구분):
┌─────────────────────────────────────┐
│                                     │
└─────────────────────────────────────┘

 1번  ① ② ③ ④
 2번  ① ② ③ ④
 ...

[저장]  [초기화]
```

---

## 7. index.html — 시험 선택 화면

### UI 구성

```
[PDF 가져오기]

2024년 정보처리기사 1회  [시험 시작]  [정답 편집]  [삭제]
2023년 정보처리기사 2회  [시험 시작]  [정답 편집]  [삭제]
네트워크관리사 2급 2024  [시험 시작]  [정답 편집]  [삭제]
```

### 목록 표시 로직

- 정답 파일(`answers/{examId}.json`)의 `label` 필드가 있으면 그것을 표시
- 없으면 파일명(`2024_1.pdf`) 그대로 표시

```js
async function refreshList() {
  const files = await window.electronAPI.listPDFs();
  const container = document.getElementById('exam-list');
  container.innerHTML = '';

  for (const file of files) {
    const examId = file.replace('.pdf', '');
    const saved  = await window.electronAPI.loadAnswers(examId);
    const label  = saved?.label || examId;

    container.insertAdjacentHTML('beforeend', `
      <div class="exam-row">
        <span class="exam-label">${label}</span>
        <button onclick="startExam('${examId}')">시험 시작</button>
        <button onclick="editAnswers('${examId}')">정답 편집</button>
        <button onclick="deleteExam('${examId}')">삭제</button>
      </div>
    `);
  }
}
```

---

## 8. exam.html — 시험 화면

### 레이아웃

```
[ PDF 영역 2fr ] | [ 사이드바 252px ]
```

### 사이드바 구조

```
[← 뒤로가기]
──────────────────
타이머: 01:32:15
──────────────────
[오답 체크] [초기화]
──────────────────
점수: 85점 (85/100)
오답: 3, 17, 42번
──────────────────
 1번  ① ② ③ ④
 2번  ① ② ③ ④
 ...
```

### 문항 수 결정

자동 감지 없음. 정답 파일의 `questionCount` 기준으로 사이드바 행 수 결정.
정답 파일이 없으면 기본 100문항으로 렌더링.

```js
const saved = await window.electronAPI.loadAnswers(examId);
const questionCount = saved?.questionCount ?? 100;
renderAnswerRows(questionCount);
```

### PDF 표시

```js
const pdfPath = await window.electronAPI.getPDFPath(examId);
document.getElementById('pdf-frame').src = pdfPath; // file:///...
```

---

## 9. 타이머 (timer.js)

변경 없음.

- 진입 즉시 카운트 시작, 150분 기본
- `HH:MM:SS` 표시, 초과 시 `시험 종료` + `+HH:MM:SS`
- 시험 시간은 추후 `index.html`에서 설정 가능하도록 확장 여지 있음

---

## 10. 채점 로직 (answers.js)

```js
async function checkAnswers() {
  const saved = await window.electronAPI.loadAnswers(examId);
  if (!saved) {
    alert('정답 파일이 없습니다. 정답 편집에서 먼저 입력해주세요.');
    return;
  }

  const correctAnswers = saved.answers;
  const userAnswers    = await window.electronAPI.loadUserAnswers(examId) || {};
  const total          = saved.questionCount;

  let score = 0;
  const wrongList = [];

  for (let q = 1; q <= total; q++) {
    const userVal    = userAnswers[String(q)];
    const correctVal = correctAnswers[String(q)];
    const isCorrect  = userVal !== undefined && userVal === correctVal;

    if (isCorrect) score++;
    else wrongList.push(q);

    markQuestion(q, isCorrect, correctVal);
  }

  document.getElementById('score-display').textContent =
    `${score}점 (${score}/${total})`;
  document.getElementById('wrong-list').textContent =
    wrongList.length ? `오답: ${wrongList.join(', ')}번` : '모두 정답!';
}
```

---

## 11. CSS 핵심 클래스

```css
.container {
  display: grid;
  grid-template-columns: 2fr 252px;
  height: 100vh;
}

.sidebar {
  width: 252px;
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
  border-left: 1px solid #ccc;
  padding: 10px;
}

.sidebar-controls {
  position: sticky;
  top: 0;
  background: white;
  z-index: 10;
  padding-bottom: 8px;
  border-bottom: 1px solid #eee;
}

.control-buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  margin-top: 6px;
}
.control-buttons button { height: 32px; font-size: 0.8rem; }

.question-row button {
  width: 32px;
  height: 32px;
  border: 1px solid #ccc;
  background: white;
  cursor: pointer;
  border-radius: 4px;
}
.question-row button.selected  { background: #4a90e2; color: white; border-color: #4a90e2; }
.question-row.correct          { background: #f0fff4; }
.question-row.wrong            { background: #fff5f5; }
.question-row button.answer-mark { border: 2px solid #38a169; }

@media (max-width: 600px) {
  .container { grid-template-columns: 1fr; }
  .sidebar-controls { position: static; }
}
```

---

## 12. 기능 구현 체크리스트

| 기능 | 구현 방법 | 우선순위 |
|------|-----------|----------|
| PDF 업로드 | `dialog.showOpenDialog` → `user-data/pdfs/` 복사 | 1 |
| 시험 선택 | IPC `pdf:list` 결과로 목록 동적 생성 | 1 |
| PDF 표시 | `<iframe src="file:///...">` | 1 |
| 타이머 | `setInterval` 1초 카운트업 | 1 |
| 답안 입력 | 버튼 클릭 → `.selected` 토글 | 1 |
| 자동 저장 | 클릭 즉시 IPC `userAnswers:save` | 1 |
| 답안 복원 | 진입 시 IPC `userAnswers:load` | 1 |
| 정답 편집 | 숫자 입력 → 실시간 문항 생성, 버튼 선택 반영 | 2 |
| 정답 저장 | IPC `answers:save` → JSON 파일 | 2 |
| 오답 체크 | IPC `answers:load` → 비교 → 마킹 | 2 |
| 점수 출력 | 채점 후 사이드바 상단 표시 | 2 |
| 오답 목록 | 오답 문제 번호 나열 | 2 |
| 표시 이름 | 정답 편집 화면에서 label 입력, 목록에 반영 | 2 |
| PDF 삭제 | 삭제 버튼 → IPC `pdf:delete` | 3 |

---

## 13. 패키징 (electron-builder)

```json
{
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "build": "electron-builder"
  },
  "dependencies": {
    "electron-store": "^8.0.0"
  },
  "devDependencies": {
    "electron": "^30.0.0",
    "electron-builder": "^24.0.0"
  },
  "build": {
    "appId": "com.yourname.cbt",
    "productName": "CBT",
    "files": ["main.js", "preload.js", "renderer/**/*"],
    "win": { "target": "nsis" },
    "mac": { "target": "dmg" }
  }
}
```

---

## 14. 사용 방법

### 기본 사용 흐름

1. **PDF 가져오기** 버튼 클릭 → 기출문제 PDF 파일 선택
2. 목록에서 해당 항목의 **정답 편집** 버튼 클릭
3. 표시 이름 입력 (예: `2024년 정보처리기사 1회`)
4. 정답 입력란에 정답 번호를 순서대로 입력 (예: `2 4 1 3 2 1 ...`)
   - 스페이스, 줄바꿈, 쉼표 모두 구분자로 사용 가능
   - 입력하는 즉시 오른쪽에 문항별 선택 상태가 실시간으로 표시됨
5. **저장** 클릭
6. 목록으로 돌아가 **시험 시작** 클릭

### 정답 파일이 없어도 시험 가능

정답 편집 없이 시험 시작 가능. 이 경우 100문항으로 시작되며, 오답 체크 기능은 사용 불가.

### 정답표 이미지가 있을 때 — Claude 활용

기출문제 PDF에 정답표가 포함되어 있거나 별도 정답표 이미지가 있는 경우, 아래 프롬프트로 Claude에게 정답 번호 목록을 추출할 수 있다.

**사용 방법**:
1. 정답표 부분을 캡처하거나 이미지로 저장
2. Claude(claude.ai)에 이미지를 첨부하고 아래 프롬프트 입력

**프롬프트**:
```
이 정답표 이미지에서 각 문항의 정답 번호만 순서대로 추출해줘.
출력 형식은 아래처럼 1번부터 순서대로 숫자만 스페이스로 구분해서 한 줄로 작성해줘.
다른 설명 없이 숫자만 출력해.

예시 출력:
2 4 1 3 2 1 4 3 2 1 ...
```

3. Claude가 출력한 숫자 나열을 복사해서 정답 편집 화면의 입력란에 그대로 붙여넣기

---

## 15. 회차 추가 방법

1. `index.html`의 **PDF 가져오기** 버튼 클릭
2. PDF 선택 (다중 선택 가능)
3. 목록 자동 갱신 → **정답 편집** 버튼으로 정답 입력

별도 코드 수정 불필요.
