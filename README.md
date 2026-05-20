# CBT

PDF 기출문제를 풀 수 있는 CBT 앱입니다. Electron 데스크탑 앱과 PWA 브라우저 버전을 함께 제공합니다.

## 안내

해당 앱은 전적으로 바이브코딩을 통한 앱이기에 오류가 많을 수 있습니다.

## 현재 버전

- 앱 버전: `3.0.0`
- 데스크탑: Electron
- 웹/PWA: Vite + IndexedDB + Service Worker
- PDF 뷰어: PDF.js canvas 렌더링

## 주요 기능

- PDF 시험지 가져오기
- 정답 직접 입력
- `.json`, `.js` 정답 파일 가져오기
- PDF.js 기반 문항 중심 보기
- 문항 번호 자동 감지 및 문항 위치 이동
- 문항 번호 패널, 응답 상태 표시
- 검토 표시
- 미응답 문항 이동
- 제출 전 미응답 확인
- 오답 체크 및 채점 기록 저장
- PDF 확대/축소
  - `+`, `-` 버튼
  - 배율 직접 입력
  - `Ctrl + 마우스 휠`
  - 화면 맞춤
- Electron 설치 파일 빌드
- PWA 빌드 및 브라우저 설치 지원

## 설치

최초 1회 의존성을 설치합니다.

```bash
npm install
```

## Electron 실행 및 빌드

개발 실행:

```bash
npm start
```

Electron 설치 파일 빌드:

```bash
npm run build:electron
```

기존 호환 명령:

```bash
npm run build
```

빌드 결과는 `release/` 폴더에 생성됩니다.

예:

```text
release/CBT Setup 3.0.0.exe
```

## PWA 실행 및 빌드

PWA 개발 서버:

```bash
npm run dev:pwa
```

접속 경로:

```text
http://localhost:5173/
```

루트(`/`)는 Electron과 같은 화면인 `renderer/index.html`로 자동 이동합니다.

PWA 프로덕션 빌드:

```bash
npm run build:pwa
```

빌드 결과는 `pwa-dist/` 폴더에 생성됩니다.

PWA 빌드 미리보기:

```bash
npm run preview:pwa
```

## Electron과 PWA 저장 방식 차이

| 구분 | Electron | PWA |
|------|----------|-----|
| PDF 저장 | `app.getPath('userData')/pdfs` | IndexedDB |
| 정답 저장 | `userData/answers` | IndexedDB |
| 사용자 답안 | `electron-store` | IndexedDB |
| 채점 기록 | `electron-store` | IndexedDB |
| 문항 매핑 | `electron-store` | IndexedDB |
| 파일 선택 | Electron dialog | 브라우저 file input |

PWA는 브라우저 저장소를 사용하므로 브라우저 데이터 삭제 시 PDF, 정답, 풀이 기록이 함께 삭제될 수 있습니다.

## 사용 방법

1. `PDF 가져오기`로 시험지 PDF를 추가합니다.
   - 여러 PDF를 한 번에 선택할 수 있습니다.
2. `정답 편집`에서 표시 이름과 정답을 입력합니다.
3. 정답 파일이 이미 있으면 `정답 파일 가져오기`로 `.js` 또는 `.json` 파일을 가져옵니다.
   - 여러 정답 파일을 한 번에 선택할 수 있습니다.
4. `시험 시작`을 누르면 PDF.js 뷰어가 PDF를 표시합니다.
5. 문항 번호가 자동 감지되면 1번 문항 위치로 이동합니다.
6. 문항 번호 패널에서 원하는 문항으로 이동하며 답안을 선택합니다.
7. 필요하면 `검토 표시` 또는 `미응답 이동`을 사용합니다.
8. `오답 체크`를 누르면 미응답 경고 후 채점합니다.
9. 목록의 `기록` 버튼에서 날짜별 채점 기록을 확인합니다.

## 파일명 규칙

PDF 파일명과 정답 파일명은 반드시 같아야 합니다.

```text
2025_1.pdf
2025_1.js
```

또는:

```text
2025_1.pdf
2025_1.json
```

## 정답 파일 형식

JavaScript 형식:

```js
var answers = {
  1: 2,
  2: 4,
  3: 1
};
```

JSON 형식:

```json
{
  "label": "2025년 정보처리기사 1회",
  "questionCount": 100,
  "answers": {
    "1": 2,
    "2": 4,
    "3": 1
  }
}
```

## PDF 보기

PDF는 iframe이 아니라 PDF.js canvas로 렌더링합니다.

시험 화면에서는 다음 기능을 제공합니다.

- 이전/다음 페이지
- 문항 번호 클릭 시 감지된 문항 위치로 이동
- 확대/축소 버튼
- 배율 직접 입력
- `Ctrl + 마우스 휠` 확대/축소
- 화면 맞춤

텍스트 레이어가 없는 스캔본 PDF는 문항 위치 자동 감지가 제한됩니다. 이 경우 페이지 매핑을 직접 입력해 페이지 단위 이동으로 사용할 수 있습니다.

## 채점 기록

`오답 체크`를 누를 때마다 기록이 저장됩니다.

기록 화면에서는 먼저 날짜별 채점 기록 리스트가 표시됩니다.

리스트에서 기록을 선택하면 다음 내용을 확인할 수 있습니다.

- 채점 날짜
- 정답 수와 정답률
- 오답 문항 수
- 틀린 문항 번호
- 문항별 채점 결과
- PDF.js 뷰어

## Claude로 정답 파일 만들기

앱 첫 실행 안내의 `프롬프트 보기`에서 복사 가능한 프롬프트를 확인할 수 있습니다.

정답이 포함된 PDF를 Claude에 업로드한 뒤 프롬프트를 붙여넣으면, 앱에서 가져올 수 있는 `.js` 정답 파일 형식으로 변환할 수 있습니다.

## Git 제외 권장 데이터

다음 파일과 폴더는 저장소에 포함하지 않는 것이 좋습니다.

```text
node_modules/
release/
pwa-dist/
pdfs/
answers/
```

Electron 사용자가 가져온 PDF, 정답, 풀이 기록은 Electron 사용자 데이터 폴더에 저장됩니다. PWA 사용자가 가져온 PDF, 정답, 풀이 기록은 브라우저 IndexedDB에 저장됩니다.
