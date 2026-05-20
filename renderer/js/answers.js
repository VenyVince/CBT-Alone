import { createPdfViewer, bindPdfToolbar } from './pdf-viewer.js';
import { detectQuestionMap, formatQuestionMap, parseManualQuestionMap } from './question-detector.js';
import { createQuestionNavigation } from './navigation.js';

(async function () {
  const params = new URLSearchParams(location.search);
  const examId = params.get('exam');

  const answerContainer = document.getElementById('answer-container');
  const checkButton = document.getElementById('check-btn');
  const resetButton = document.getElementById('reset-btn');
  const backButton = document.getElementById('back-btn');
  const scoreDisplay = document.getElementById('score-display');
  const wrongList = document.getElementById('wrong-list');
  const answeredCount = document.getElementById('answered-count');
  const title = document.getElementById('exam-title');
  const currentQuestionTitle = document.getElementById('current-question-title');
  const reviewButton = document.getElementById('review-btn');
  const mappingStatus = document.getElementById('mapping-status');
  const mapDialog = document.getElementById('map-dialog');
  const mapInput = document.getElementById('map-input');

  if (!examId) {
    location.replace('index.html');
    return;
  }

  const pdfViewer = createPdfViewer();
  bindPdfToolbar(pdfViewer);

  let questionCount = 100;
  let userAnswers = {};
  let reviews = {};
  let currentQuestion = 1;
  let mappingState = { status: 'idle', map: {}, failedQuestions: [] };
  let gradingResults = {};

  const navigation = createQuestionNavigation({
    container: document.getElementById('question-nav'),
    onSelect: selectQuestion,
  });

  function normalizeStoredAnswers(savedUserAnswers) {
    if (savedUserAnswers?.answers || savedUserAnswers?.reviews) {
      return {
        answers: savedUserAnswers.answers || {},
        reviews: savedUserAnswers.reviews || {},
      };
    }
    return {
      answers: savedUserAnswers || {},
      reviews: {},
    };
  }

  async function persistUserState() {
    await window.electronAPI.saveUserAnswers(examId, {
      answers: userAnswers,
      reviews,
    });
  }

  function updateAnsweredCount() {
    answeredCount.textContent = `${Object.keys(userAnswers).length}/${questionCount}`;
  }

  function updateMappingStatus() {
    const messages = {
      idle: 'PDF 분석 대기',
      scanning: '문항 번호 감지 중',
      success: `문항 ${mappingState.detectedCount}/${questionCount} 감지`,
      partial: `일부 감지: ${mappingState.detectedCount}/${questionCount}`,
      failed: mappingState.reason || '문항 감지 실패',
    };
    mappingStatus.textContent = messages[mappingState.status] || '';
    mappingStatus.className = `mapping-${mappingState.status}`;
    pdfViewer.setQuestionMap(mappingState.map);
  }

  function updateNavigation() {
    navigation.setState({
      currentQuestion,
      answers: userAnswers,
      reviews,
      results: gradingResults,
    });
    updateAnsweredCount();
    currentQuestionTitle.textContent = `${currentQuestion}번 답안`;
    reviewButton.classList.toggle('review-active', Boolean(reviews[String(currentQuestion)]));
  }

  function clearMarks() {
    gradingResults = {};
    answerContainer.querySelectorAll('.question-row').forEach((row) => {
      row.classList.remove('correct', 'wrong');
      row.querySelectorAll('button').forEach((button) => {
        button.classList.remove('answer-mark');
      });
    });
    updateNavigation();
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
    updateNavigation();
  }

  function markQuestion(q, isCorrect, correctValue) {
    const row = answerContainer.querySelector(`.question-row[data-q="${q}"]`);
    if (!row) return;

    row.classList.add(isCorrect ? 'correct' : 'wrong');
    const correctButton = row.querySelector(`button[data-v="${correctValue}"]`);
    if (correctButton) correctButton.classList.add('answer-mark');
    gradingResults[String(q)] = isCorrect;
  }

  async function selectQuestion(questionNum) {
    currentQuestion = Math.min(Math.max(questionNum, 1), questionCount);
    updateNavigation();

    if (mappingState.status === 'success' || mappingState.status === 'partial') {
      const moved = await pdfViewer.goToQuestion(currentQuestion);
      if (!moved && mappingState.status === 'partial') {
        scoreDisplay.textContent = `${currentQuestion}번의 PDF 페이지를 감지하지 못했습니다.`;
      }
    }
  }

  function getUnansweredQuestions() {
    const unanswered = [];
    for (let q = 1; q <= questionCount; q += 1) {
      if (userAnswers[String(q)] === undefined) unanswered.push(q);
    }
    return unanswered;
  }

  async function checkAnswers() {
    const unanswered = getUnansweredQuestions();
    if (unanswered.length > 0) {
      const sample = unanswered.slice(0, 12).join(', ');
      const suffix = unanswered.length > 12 ? '...' : '';
      const ok = confirm(`미응답 ${unanswered.length}문항이 있습니다. (${sample}${suffix}번)\n제출하시겠습니까?`);
      if (!ok) {
        await selectQuestion(unanswered[0]);
        return;
      }
    }

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
    updateNavigation();

    await window.electronAPI.saveHistory(examId, {
      score,
      total: questionCount,
      wrong,
      userAnswers: { ...userAnswers },
      reviews: { ...reviews },
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

    currentQuestion = Number(q);
    clearMarks();
    row.querySelectorAll('button').forEach((item) => item.classList.remove('selected'));
    button.classList.add('selected');
    userAnswers[q] = value;
    await persistUserState();
    scoreDisplay.textContent = '답안이 변경되었습니다.';
    wrongList.textContent = '';
    updateNavigation();
  });

  checkButton.addEventListener('click', checkAnswers);
  resetButton.addEventListener('click', async () => {
    userAnswers = {};
    reviews = {};
    await persistUserState();
    clearMarks();
    answerContainer.querySelectorAll('button.selected').forEach((button) => {
      button.classList.remove('selected');
    });
    scoreDisplay.textContent = '답안을 초기화했습니다.';
    wrongList.textContent = '';
    updateNavigation();
  });
  backButton.addEventListener('click', () => {
    location.href = 'index.html';
  });
  reviewButton.addEventListener('click', async () => {
    const key = String(currentQuestion);
    reviews[key] = !reviews[key];
    if (!reviews[key]) delete reviews[key];
    await persistUserState();
    updateNavigation();
  });
  document.getElementById('prev-question-btn').addEventListener('click', () => selectQuestion(currentQuestion - 1));
  document.getElementById('next-question-btn').addEventListener('click', () => selectQuestion(currentQuestion + 1));
  document.getElementById('next-unanswered-btn').addEventListener('click', () => {
    const unanswered = getUnansweredQuestions().find((q) => q >= currentQuestion + 1) || getUnansweredQuestions()[0];
    if (unanswered) selectQuestion(unanswered);
    else scoreDisplay.textContent = '미응답 문항이 없습니다.';
  });
  document.getElementById('edit-map-btn').addEventListener('click', () => {
    mapInput.value = formatQuestionMap(mappingState.map, questionCount);
    mapDialog.showModal();
  });
  document.getElementById('save-map-btn').addEventListener('click', async () => {
    mappingState = parseManualQuestionMap(mapInput.value, questionCount, pdfViewer.getTotalPages());
    await window.electronAPI.saveQuestionMap(examId, {
      map: mappingState.map,
      isManuallyOverridden: true,
    });
    updateMappingStatus();
    mapDialog.close();
  });
  document.getElementById('rescan-map-btn').addEventListener('click', async () => {
    mappingState = { status: 'scanning', map: {}, failedQuestions: [] };
    updateMappingStatus();
    mappingState = await detectQuestionMap(pdfViewer.getPdfDocument(), questionCount);
    updateMappingStatus();
    mapInput.value = formatQuestionMap(mappingState.map, questionCount);
  });

  const [pdfBuffer, savedAnswers, savedUserAnswers, savedMap] = await Promise.all([
    window.electronAPI.getPDFBuffer(examId),
    window.electronAPI.loadAnswers(examId),
    window.electronAPI.loadUserAnswers(examId),
    window.electronAPI.loadQuestionMap(examId),
  ]);

  title.textContent = savedAnswers?.label || examId;
  questionCount = savedAnswers?.questionCount || 100;
  const normalized = normalizeStoredAnswers(savedUserAnswers);
  userAnswers = normalized.answers;
  reviews = normalized.reviews;

  navigation.init(questionCount);
  renderAnswerRows();
  restoreSelections();

  const pdf = await pdfViewer.load(pdfBuffer);
  if (pdf) {
    await pdfViewer.fitToScreen();
    if (savedMap?.map) {
      mappingState = {
        status: 'partial',
        map: savedMap.map,
        detectedCount: Object.keys(savedMap.map).length,
        expectedCount: questionCount,
        failedQuestions: [],
        isManuallyOverridden: true,
        reason: '저장된 수동 매핑을 사용 중입니다.',
      };
      if (mappingState.detectedCount === questionCount) mappingState.status = 'success';
    } else {
      mappingState = { status: 'scanning', map: {}, failedQuestions: [] };
      updateMappingStatus();
      mappingState = await detectQuestionMap(pdf, questionCount);
    }
  } else {
    mappingState = { status: 'failed', map: {}, reason: 'PDF 파일을 찾을 수 없습니다.' };
  }
  updateMappingStatus();
  updateNavigation();
  await selectQuestion(1);
}());
