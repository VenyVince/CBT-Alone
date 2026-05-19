(async function () {
  const params = new URLSearchParams(location.search);
  const examId = params.get('exam');

  const labelInput = document.getElementById('label-input');
  const rawInput = document.getElementById('raw-input');
  const container = document.getElementById('answer-container');
  const countDisplay = document.getElementById('question-count');
  const status = document.getElementById('editor-status');

  if (!examId) {
    location.replace('index.html');
    return;
  }

  function parseNumbers() {
    return rawInput.value
      .split(/[\s,]+/)
      .map((value) => Number(value))
      .filter((value) => value >= 1 && value <= 4);
  }

  function syncRawFromRows() {
    const nums = Array.from(container.querySelectorAll('.question-row')).map((row) => {
      return row.querySelector('button.selected')?.dataset.v || '';
    });
    rawInput.value = nums.join(' ').trim();
  }

  function renderRows(nums) {
    container.innerHTML = '';
    nums.forEach((selected, index) => {
      const q = index + 1;
      const row = document.createElement('div');
      row.className = 'question-row';
      row.dataset.q = String(q);
      row.innerHTML = `
        <span class="q-num">${q}번</span>
        <button type="button" data-v="1">1</button>
        <button type="button" data-v="2">2</button>
        <button type="button" data-v="3">3</button>
        <button type="button" data-v="4">4</button>
      `;

      const button = row.querySelector(`button[data-v="${selected}"]`);
      if (button) button.classList.add('selected');
      container.appendChild(row);
    });
    countDisplay.textContent = `${nums.length}문항`;
  }

  async function save() {
    const nums = parseNumbers();
    const answers = {};
    nums.forEach((value, index) => {
      answers[String(index + 1)] = value;
    });

    await window.electronAPI.saveAnswers(examId, {
      label: labelInput.value.trim() || examId,
      questionCount: nums.length,
      answers,
    });

    status.textContent = '저장했습니다.';
  }

  rawInput.addEventListener('input', () => {
    renderRows(parseNumbers());
    status.textContent = '';
  });

  container.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-v]');
    if (!button) return;

    const row = button.closest('.question-row');
    row.querySelectorAll('button').forEach((item) => item.classList.remove('selected'));
    button.classList.add('selected');
    syncRawFromRows();
    status.textContent = '';
  });

  document.getElementById('save-btn').addEventListener('click', save);
  document.getElementById('clear-btn').addEventListener('click', () => {
    rawInput.value = '';
    renderRows([]);
    status.textContent = '초기화했습니다.';
  });
  document.getElementById('back-btn').addEventListener('click', () => {
    location.href = 'index.html';
  });

  const saved = await window.electronAPI.loadAnswers(examId);
  labelInput.value = saved?.label || examId;
  if (saved?.answers) {
    const nums = Array.from({ length: saved.questionCount || 0 }, (_item, index) => {
      return saved.answers[String(index + 1)] || '';
    });
    rawInput.value = nums.join(' ').trim();
    renderRows(parseNumbers());
  }
}());
