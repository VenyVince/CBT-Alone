(async function () {
  const params = new URLSearchParams(location.search);
  const examId = params.get('exam');

  const title = document.getElementById('history-title');
  const container = document.getElementById('history-container');
  const list = document.getElementById('history-list');
  const summary = document.getElementById('history-summary');
  const wrongList = document.getElementById('history-wrong-list');
  const answerContainer = document.getElementById('history-answer-container');
  const pdfFrame = document.getElementById('pdf-frame');

  if (!examId) {
    location.replace('index.html');
    return;
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '날짜 없음';
    return date.toLocaleString();
  }

  function rate(score, total) {
    if (!total) return 0;
    return Math.round((score / total) * 100);
  }

  function selectHistory(item, button) {
    container.classList.remove('list-only');
    list.querySelectorAll('.history-item.selected').forEach((row) => {
      row.classList.remove('selected');
    });
    button.classList.add('selected');

    const wrong = Array.isArray(item.wrong) ? item.wrong : [];
    summary.textContent = `${item.score}/${item.total} 정답 (${rate(item.score, item.total)}%), 오답 ${wrong.length}문항`;
    wrongList.textContent = wrong.length ? `오답 문항: ${wrong.join(', ')}번` : '오답 문항: 없음';
    renderAnswerRows(item);
  }

  function renderAnswerRows(item) {
    const wrongSet = new Set(Array.isArray(item.wrong) ? item.wrong.map(Number) : []);
    const userAnswers = item.userAnswers || {};
    const correctAnswers = item.correctAnswers || {};
    answerContainer.innerHTML = '';

    for (let q = 1; q <= item.total; q += 1) {
      const userValue = userAnswers[String(q)];
      const correctValue = correctAnswers[String(q)];
      const row = document.createElement('div');
      row.className = `question-row ${wrongSet.has(q) ? 'wrong' : 'correct'}`;
      row.dataset.q = String(q);
      row.innerHTML = `
        <span class="q-num">${q}번</span>
        <button type="button" data-v="1">1</button>
        <button type="button" data-v="2">2</button>
        <button type="button" data-v="3">3</button>
        <button type="button" data-v="4">4</button>
      `;
      if (userValue !== undefined) {
        row.querySelector(`button[data-v="${userValue}"]`)?.classList.add('selected');
      }
      if (correctValue !== undefined) {
        row.querySelector(`button[data-v="${correctValue}"]`)?.classList.add('answer-mark');
      }
      answerContainer.appendChild(row);
    }
  }

  document.getElementById('back-btn').addEventListener('click', () => {
    location.href = 'index.html';
  });

  const [pdfPath, savedAnswers, historyList] = await Promise.all([
    window.electronAPI.getPDFPath(examId),
    window.electronAPI.loadAnswers(examId),
    window.electronAPI.loadHistory(examId),
  ]);

  title.textContent = savedAnswers?.label || examId;
  if (pdfPath) pdfFrame.src = pdfPath;

  const records = Array.isArray(historyList) ? historyList : [];
  if (records.length === 0) {
    list.innerHTML = '<p class="empty-history">채점 기록이 없습니다.</p>';
    return;
  }

  records.forEach((item, index) => {
    const wrong = Array.isArray(item.wrong) ? item.wrong : [];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'history-item';
    button.innerHTML = `
      <strong>${formatDate(item.checkedAt)}</strong>
      <span>${item.score}/${item.total} 정답 (${rate(item.score, item.total)}%)</span>
      <span>오답 ${wrong.length}문항</span>
    `;
    button.addEventListener('click', () => selectHistory(item, button));
    list.appendChild(button);

  });
}());
