# 정보처리기사 CBT 구현 기획서

> AI가 바로 구현에 들어갈 수 있도록 작성된 기술 기획서

---

## 1. 프로젝트 개요

- 목적: 정보처리기사 PDF 기출문제를 브라우저에서 푸는 개인용 CBT 시스템
- 특징: 백엔드 없음, 완전 정적 웹앱, 광고 없음
- 배포: Live Server 또는 GitHub Pages (정적 서빙)
- 기술 스택: HTML / CSS / Vanilla JS / localStorage

---

## 2. 파일 구조

```
project/
├── index.html          # 시험 선택 화면
├── exam.html           # 시험 화면
├── css/
│   └── style.css
├── js/
│   ├── timer.js        # 타이머 로직
│   └── answers.js      # 채점 로직
├── pdfs/
│   ├── 2022_1.pdf
│   └── 2022_2.pdf
└── answers/
    ├── 2022_1.js
    └── 2022_2.js
```

> 회차 추가 = `pdfs/`에 PDF, `answers/`에 정답 JS 파일 추가 + `index.html` 목록 배열에 항목 추가

---

## 3. 정답 파일 형식

파일 경로: `answers/{examId}.js`

```js
// answers/2022_1.js
var answers = {
  1: 2,
  2: 4,
  3: 1,
  // ... 100번까지
};
```

- `const` 대신 `var` 사용 — 동적 `<script>` 로드 시 전역 스코프 접근 보장
- key: 문제 번호(숫자), value: 정답 번호 1~4(숫자)

---

## 4. localStorage 구조

```json
{
  "2022_1": {
    "1": 2,
    "2": 4,
    "3": 1
  },
  "2022_2": {
    "5": 3
  }
}
```

- key: `examId` 문자열 (`"2022_1"`)
- value: `{ "문제번호": 선택한답 }` 객체
- 답 선택 즉시 저장, 페이지 재진입 시 복원

---

## 5. index.html — 시험 선택 화면

### 역할

회차 선택 후 시험 화면으로 이동

### 회차 목록 (JS 배열로 하드코딩)

```js
const exams = [
  { id: '2022_1', label: '2022년 1회' },
  { id: '2022_2', label: '2022년 2회' },
  { id: '2021_3', label: '2021년 3회' },
];
```

배열을 순회하여 `<select>` 옵션 동적 생성

### 동작 흐름

1. `<select>` 에서 회차 선택
2. 시험 시작 버튼 클릭
3. `exam.html?exam=2022_1` 로 이동

---

## 6. exam.html — 시험 화면

### 레이아웃

CSS Grid 2열 구성

```
[ PDF 영역 2fr ] | [ 사이드바 1fr ]
```

```css
.container {
  display: grid;
  grid-template-columns: 2fr 1fr;
  height: 100vh;
}

.sidebar {
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
  border-left: 1px solid #ccc;
}
```

### PDF 영역

URL 파라미터에서 `examId` 추출 후 iframe src 지정

```js
const params = new URLSearchParams(location.search);
const examId = params.get('exam'); // "2022_1"
document.getElementById('pdf-frame').src = `/pdfs/${examId}.pdf`;
```

```html
<iframe id="pdf-frame" style="width:100%; height:100vh; border:none;"></iframe>
```

---

## 7. 사이드바 — 타이머

### 스펙

- 시험 화면 진입 즉시 카운트 시작
- 기본 제한: 150분 (9,000초)
- 표시 형식: `HH:MM:SS`
- 150분 초과 시: `시험 종료` 텍스트 + `+HH:MM:SS` 형식으로 초과 시간 별도 표시

### 구현

```js
// timer.js
let elapsed = 0;
const LIMIT = 9000; // 150분

const timer = setInterval(() => {
  elapsed++;
  if (elapsed <= LIMIT) {
    document.getElementById('timer-display').textContent = fmt(elapsed);
  } else {
    document.getElementById('timer-status').textContent = '시험 종료';
    document.getElementById('timer-overtime').textContent = '+' + fmt(elapsed - LIMIT);
  }
}, 1000);

function fmt(sec) {
  return [
    Math.floor(sec / 3600),
    Math.floor((sec % 3600) / 60),
    sec % 60
  ].map(v => String(v).padStart(2, '0')).join(':');
}
```

### UI 예시

```
진행 중:    01:32:15
종료 후:    시험 종료
            +00:12:31
```

---

## 8. 사이드바 — 답안 입력

### UI 구조

문제 번호 1~100, 각 문제마다 ①②③④ 버튼 4개 (JS로 동적 생성)

```js
for (let q = 1; q <= 100; q++) {
  const row = document.createElement('div');
  row.className = 'question-row';
  row.dataset.q = q;
  row.innerHTML = `
    <span class="q-num">${q}번</span>
    <button data-v="1">①</button>
    <button data-v="2">②</button>
    <button data-v="3">③</button>
    <button data-v="4">④</button>
  `;
  answerContainer.appendChild(row);
}
```

### 클릭 동작

```js
answerContainer.addEventListener('click', (e) => {
  if (!e.target.matches('button')) return;
  const row = e.target.closest('.question-row');
  const q = row.dataset.q;
  const v = Number(e.target.dataset.v);

  // 선택 상태 토글
  row.querySelectorAll('button').forEach(b => b.classList.remove('selected'));
  e.target.classList.add('selected');

  // localStorage 저장
  saveAnswer(examId, q, v);
});
```

### 저장 / 복원

```js
function saveAnswer(examId, q, v) {
  const data = JSON.parse(localStorage.getItem(examId) || '{}');
  data[q] = v;
  localStorage.setItem(examId, JSON.stringify(data));
}

function loadAnswers(examId) {
  const data = JSON.parse(localStorage.getItem(examId) || '{}');
  for (const [q, v] of Object.entries(data)) {
    const row = document.querySelector(`.question-row[data-q="${q}"]`);
    if (!row) continue;
    const btn = row.querySelector(`button[data-v="${v}"]`);
    if (btn) btn.classList.add('selected');
  }
}
```

### 버튼 상태

| 상태 | 스타일 |
|------|--------|
| 미선택 | 기본 (테두리) |
| 선택 완료 | `.selected` — 배경색 강조 |
| 오답 (채점 후) | `.wrong` — 빨간 표시 |
| 정답 (채점 후) | `.correct` — 초록 표시 |

---

## 9. 사이드바 — 오답 체크

### 버튼

```html
<button id="check-btn">오답 체크</button>
```

### 동작 흐름

```
오답 체크 버튼 클릭
→ answers/{examId}.js 동적 로드
→ window.answers 와 localStorage 사용자 답안 비교
→ 각 문제 행에 정답(초록) / 오답(빨강) 표시
→ 상단에 점수 출력
→ 오답 문제 번호 목록 출력
```

### 정답 파일 동적 로드

```js
function loadAnswerFile(examId) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `/answers/${examId}.js`;
    s.onload = () => resolve(window.answers);
    s.onerror = () => reject(new Error('정답 파일 로드 실패'));
    document.head.appendChild(s);
  });
}
```

### 채점 로직

```js
// answers.js
async function checkAnswers() {
  const correctAnswers = await loadAnswerFile(examId);
  const userAnswers = JSON.parse(localStorage.getItem(examId) || '{}');

  let score = 0;
  const wrongList = [];

  for (let q = 1; q <= 100; q++) {
    const userVal = userAnswers[String(q)];
    const correctVal = correctAnswers[q];
    const isCorrect = userVal === correctVal;

    if (isCorrect) {
      score++;
    } else {
      wrongList.push(q);
    }

    markQuestion(q, isCorrect, correctVal);
  }

  document.getElementById('score-display').textContent = `${score}점 (${score}/100)`;
  document.getElementById('wrong-list').textContent =
    wrongList.length ? `오답: ${wrongList.join(', ')}번` : '모두 정답!';
}

function markQuestion(q, isCorrect, correctVal) {
  const row = document.querySelector(`.question-row[data-q="${q}"]`);
  if (!row) return;
  row.classList.add(isCorrect ? 'correct' : 'wrong');
  if (!isCorrect) {
    // 정답 버튼에 별도 표시
    const correctBtn = row.querySelector(`button[data-v="${correctVal}"]`);
    if (correctBtn) correctBtn.classList.add('answer-mark');
  }
}
```

---

## 10. CSS 핵심 클래스

```css
/* 답안 버튼 기본 */
.question-row button {
  width: 32px;
  height: 32px;
  border: 1px solid #ccc;
  background: white;
  cursor: pointer;
  border-radius: 4px;
}

/* 선택 상태 */
.question-row button.selected {
  background: #4a90e2;
  color: white;
  border-color: #4a90e2;
}

/* 채점 후 — 정답 행 */
.question-row.correct {
  background: #f0fff4;
}

/* 채점 후 — 오답 행 */
.question-row.wrong {
  background: #fff5f5;
}

/* 실제 정답 표시 버튼 */
.question-row button.answer-mark {
  border: 2px solid #38a169;
}
```

---

## 11. 기능 구현 체크리스트

| 기능 | 구현 방법 | 우선순위 |
|------|-----------|----------|
| 시험 선택 | `index.html` — `<select>` + 이동 | 1 |
| PDF 표시 | `<iframe src>` 동적 지정 | 1 |
| 타이머 | `setInterval` 1초 카운트업 | 1 |
| 답안 입력 | 버튼 클릭 → `.selected` 토글 | 1 |
| 자동 저장 | 클릭 즉시 localStorage 저장 | 1 |
| 답안 복원 | 진입 시 localStorage 불러와 버튼 복원 | 1 |
| 오답 체크 | 동적 script 로드 → 비교 → 마킹 | 2 |
| 점수 출력 | 채점 후 상단 표시 | 2 |
| 오답 목록 | 오답 문제 번호 나열 | 2 |

---

## 12. 회차 추가 방법

1. `pdfs/` 에 PDF 파일 추가 (`2021_2.pdf`)
2. `answers/` 에 정답 JS 파일 추가 (`2021_2.js`)
3. `index.html` 내 `exams` 배열에 항목 추가

```js
{ id: '2021_2', label: '2021년 2회' }
```

이것으로 완료. 다른 코드 수정 불필요.
