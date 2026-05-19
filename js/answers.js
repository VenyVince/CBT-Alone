(function () {
  const QUESTION_COUNT = 100;
  const params = new URLSearchParams(location.search);
  const examId = params.get('exam');

  const examLabels = {
    '2025_3': '2025년 3회',
    '2025_2': '2025년 2회',
    '2025_1': '2025년 1회',
    '2024_3': '2024년 3회',
    '2024_2': '2024년 2회',
    '2024_1': '2024년 1회',
    '2023_3': '2023년 3회',
    '2023_2': '2023년 2회',
    '2023_1': '2023년 1회',
  };

  const answerContainer = document.getElementById('answer-container');
  const pdfFrame = document.getElementById('pdf-frame');
  const checkButton = document.getElementById('check-btn');
  const resetButton = document.getElementById('reset-btn');
  const backButton = document.getElementById('back-btn');
  const scoreDisplay = document.getElementById('score-display');
  const wrongList = document.getElementById('wrong-list');
  const answeredCount = document.getElementById('answered-count');
  const title = document.getElementById('exam-title');

  if (!answerContainer || !pdfFrame || !examId) {
    location.replace('index.html');
    return;
  }

  const examLabel = examLabels[examId] || examId;
  document.title = `${examLabel} 정보처리기사 CBT`;
  title.textContent = examLabel;
  pdfFrame.src = `pdfs/${encodeURIComponent(examId)}.pdf`;

  function getSavedAnswers() {
    try {
      return JSON.parse(localStorage.getItem(examId) || '{}');
    } catch {
      return {};
    }
  }

  function setSavedAnswers(data) {
    localStorage.setItem(examId, JSON.stringify(data));
  }

  function saveAnswer(q, value) {
    const data = getSavedAnswers();
    data[q] = value;
    setSavedAnswers(data);
    updateAnsweredCount();
  }

  function updateAnsweredCount() {
    const total = Object.keys(getSavedAnswers()).length;
    answeredCount.textContent = `${total}/${QUESTION_COUNT}`;
  }

  function clearMarks() {
    answerContainer.querySelectorAll('.question-row').forEach((row) => {
      row.classList.remove('correct', 'wrong');
      row.querySelectorAll('button').forEach((button) => {
        button.classList.remove('answer-mark');
      });
    });
  }

  function createAnswerRows() {
    for (let q = 1; q <= QUESTION_COUNT; q += 1) {
      const row = document.createElement('div');
      row.className = 'question-row';
      row.dataset.q = String(q);
      row.innerHTML = `
        <span class="q-num">${q}번</span>
        <button type="button" data-v="1" aria-label="${q}번 1번">1</button>
        <button type="button" data-v="2" aria-label="${q}번 2번">2</button>
        <button type="button" data-v="3" aria-label="${q}번 3번">3</button>
        <button type="button" data-v="4" aria-label="${q}번 4번">4</button>
      `;
      answerContainer.appendChild(row);
    }
  }

  function loadSelectedAnswers() {
    const data = getSavedAnswers();
    Object.entries(data).forEach(([q, value]) => {
      const row = answerContainer.querySelector(`.question-row[data-q="${q}"]`);
      const button = row?.querySelector(`button[data-v="${value}"]`);
      if (button) button.classList.add('selected');
    });
    updateAnsweredCount();
  }

  function loadAnswerFile() {
    return new Promise((resolve, reject) => {
      delete window.answers;
      const existing = document.querySelector('script[data-answer-file]');
      if (existing) existing.remove();

      const script = document.createElement('script');
      script.src = `answers/${encodeURIComponent(examId)}.js`;
      script.dataset.answerFile = examId;
      script.onload = () => resolve(window.answers || {});
      script.onerror = () => reject(new Error('정답 파일 로드 실패'));
      document.head.appendChild(script);
    });
  }

  function markQuestion(q, isCorrect, correctValue) {
    const row = answerContainer.querySelector(`.question-row[data-q="${q}"]`);
    if (!row) return;

    row.classList.add(isCorrect ? 'correct' : 'wrong');
    const correctButton = row.querySelector(`button[data-v="${correctValue}"]`);
    if (correctButton) correctButton.classList.add('answer-mark');
  }

  async function checkAnswers() {
    clearMarks();
    scoreDisplay.textContent = '채점 중입니다...';
    wrongList.textContent = '';

    try {
      const correctAnswers = await loadAnswerFile();
      const userAnswers = getSavedAnswers();
      let score = 0;
      const wrong = [];

      for (let q = 1; q <= QUESTION_COUNT; q += 1) {
        const userValue = Number(userAnswers[String(q)]);
        const correctValue = Number(correctAnswers[q]);
        const isCorrect = userValue === correctValue;

        if (isCorrect) {
          score += 1;
        } else {
          wrong.push(q);
        }

        markQuestion(q, isCorrect, correctValue);
      }

      scoreDisplay.textContent = `${score}점 (${score}/${QUESTION_COUNT})`;
      wrongList.textContent = wrong.length ? `오답: ${wrong.join(', ')}번` : '모두 정답입니다.';
    } catch (error) {
      scoreDisplay.textContent = '채점할 수 없습니다.';
      wrongList.textContent = error.message;
    }
  }

  answerContainer.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-v]');
    if (!button) return;

    const row = button.closest('.question-row');
    const q = row.dataset.q;
    const value = Number(button.dataset.v);

    clearMarks();
    row.querySelectorAll('button').forEach((item) => item.classList.remove('selected'));
    button.classList.add('selected');
    scoreDisplay.textContent = '답안이 변경되었습니다.';
    wrongList.textContent = '';
    saveAnswer(q, value);
  });

  checkButton.addEventListener('click', checkAnswers);

  backButton.addEventListener('click', () => {
    location.href = 'index.html';
  });

  resetButton.addEventListener('click', () => {
    localStorage.removeItem(examId);
    clearMarks();
    answerContainer.querySelectorAll('button.selected').forEach((button) => {
      button.classList.remove('selected');
    });
    scoreDisplay.textContent = '답안을 초기화했습니다.';
    wrongList.textContent = '';
    updateAnsweredCount();
  });

  createAnswerRows();
  loadSelectedAnswers();
}());
