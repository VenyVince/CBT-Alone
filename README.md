# 정보처리기사 CBT

정보처리기사 기출 PDF를 브라우저에서 풀 수 있는 정적 CBT 웹앱입니다.

## 실행 방법

별도 빌드 과정은 없습니다.

1. 프로젝트 폴더에서 `index.html`을 브라우저로 엽니다.
2. 시험 회차를 선택합니다.
3. `시험 시작`을 누르면 PDF 문제와 답안 입력 화면이 열립니다.

Live Server 같은 정적 서버로 실행해도 됩니다.

## 데이터 파일

PDF와 정답 파일은 Git에 포함하지 않습니다.

필요한 파일은 아래 위치에 직접 넣어야 합니다.

```text
pdfs/{examId}.pdf
answers/{examId}.js
```

예시:

```text
pdfs/2025_1.pdf
answers/2025_1.js
```

정답 파일 형식:

```js
var answers = {
  1: 2,
  2: 4,
  3: 1,
};
```

## 회차 추가

1. `pdfs/`에 PDF 파일을 추가합니다.
2. `answers/`에 같은 `examId`의 정답 JS 파일을 추가합니다.
3. `index.html`의 `exams` 배열에 회차를 추가합니다.

```js
{ id: '2025_1', label: '2025년 1회' }
```

답안 선택 내용은 브라우저 `localStorage`에 자동 저장됩니다.
