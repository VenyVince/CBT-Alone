(async function () {
  const params = new URLSearchParams(location.search);
  const examId = params.get('exam');

  const answerContainer = document.getElementById('answer-container');
  const pdfFrame = document.getElementById('pdf-frame');
  const checkButton = document.getElementById('check-btn');
  const resetButton = document.getElementById('reset-btn');
  const backButton = document.getElementById('back-btn');
  const scoreDisplay = document.getElementById('score-display');
  const wrongList = document.getElementById('wrong-list');
  const answeredCount = document.getElementById('answered-count');
  const title = document.getElementById('exam-title');

  if (!examId) {
    location.replace('index.html');
    return;
  }

  let questionCount = 100;
  let userAnswers = {};

  function updateAnsweredCount() {
    answeredCount.textContent = `${Object.keys(userAnswers).length}/${questionCount}`;
  }

  function clearMarks() {
    answerContainer.querySelectorAll('.question-row').forEach((row) => {
      row.classList.remove('correct', 'wrong');
      row.querySelectorAll('button').forEach((button) => {
        button.classList.remove('answer-mark');
      });
    });
  }

  function renderAnswerRows() {
    answerContainer.innerHTML = '';
    for (let q = 1; q <= questionCount; q += 1) {
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

  function restoreSelections() {
    Object.entries(userAnswers).forEach(([q, value]) => {
      const row = answerContainer.querySelector(`.question-row[data-q="${q}"]`);
      const button = row?.querySelector(`button[data-v="${value}"]`);
      if (button) button.classList.add('selected');
    });
    updateAnsweredCount();
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
    const saved = await window.electronAPI.loadAnswers(examId);
    if (!saved) {
      scoreDisplay.textContent = '정답 파일이 없습니다.';
      wrongList.textContent = '정답 편집에서 먼저 입력해주세요.';
      return;
    }

    const correctAnswers = saved.answers || {};
    let score = 0;
    const wrong = [];

    for (let q = 1; q <= questionCount; q += 1) {
      const userValue = Number(userAnswers[String(q)]);
      const correctValue = Number(correctAnswers[String(q)]);
      const isCorrect = userAnswers[String(q)] !== undefined && userValue === correctValue;

      if (isCorrect) score += 1;
      else wrong.push(q);

      markQuestion(q, isCorrect, correctValue);
    }

    scoreDisplay.textContent = `${score}점 (${score}/${questionCount})`;
    wrongList.textContent = wrong.length ? `오답: ${wrong.join(', ')}번` : '모두 정답입니다.';

    await window.electronAPI.saveHistory(examId, {
      score,
      total: questionCount,
      wrong,
      userAnswers: { ...userAnswers },
      correctAnswers: { ...correctAnswers },
      checkedAt: new Date().toISOString(),
    });
  }

  answerContainer.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-v]');
    if (!button) return;

    const row = button.closest('.question-row');
    const q = row.dataset.q;
    const value = Number(button.dataset.v);

    clearMarks();
    row.querySelectorAll('button').forEach((item) => item.classList.remove('selected'));
    button.classList.add('selected');
    userAnswers[q] = value;
    await window.electronAPI.saveUserAnswers(examId, userAnswers);
    scoreDisplay.textContent = '답안이 변경되었습니다.';
    wrongList.textContent = '';
    updateAnsweredCount();
  });

  checkButton.addEventListener('click', checkAnswers);
  resetButton.addEventListener('click', async () => {
    userAnswers = {};
    await window.electronAPI.saveUserAnswers(examId, userAnswers);
    clearMarks();
    answerContainer.querySelectorAll('button.selected').forEach((button) => {
      button.classList.remove('selected');
    });
    scoreDisplay.textContent = '답안을 초기화했습니다.';
    wrongList.textContent = '';
    updateAnsweredCount();
  });
  backButton.addEventListener('click', () => {
    location.href = 'index.html';
  });

  const [pdfPath, savedAnswers, savedUserAnswers] = await Promise.all([
    window.electronAPI.getPDFPath(examId),
    window.electronAPI.loadAnswers(examId),
    window.electronAPI.loadUserAnswers(examId),
  ]);

  title.textContent = savedAnswers?.label || examId;
  questionCount = savedAnswers?.questionCount || 100;
  userAnswers = savedUserAnswers || {};

  if (pdfPath) pdfFrame.src = pdfPath;
  else scoreDisplay.textContent = 'PDF 파일을 찾을 수 없습니다.';

  renderAnswerRows();
  restoreSelections();
}());
