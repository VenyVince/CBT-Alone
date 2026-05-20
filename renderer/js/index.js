(async function () {
  const helpButton = document.getElementById('help-btn');
  const importButton = document.getElementById('import-btn');
  const answerImportButton = document.getElementById('answer-import-btn');
  const list = document.getElementById('exam-list');
  const emptyState = document.getElementById('empty-state');
  const guideDialog = document.getElementById('guide-dialog');
  const dontShowGuide = document.getElementById('dont-show-guide');
  const guideMainView = document.getElementById('guide-main-view');
  const guidePromptView = document.getElementById('guide-prompt-view');
  const promptViewButton = document.getElementById('prompt-view-btn');
  const promptBackButton = document.getElementById('prompt-back-btn');
  const promptCopyButton = document.getElementById('prompt-copy-btn');
  const promptText = document.getElementById('prompt-text');
  const promptCopyStatus = document.getElementById('prompt-copy-status');

  function examIdFromFile(file) {
    return file.replace(/\.pdf$/i, '');
  }

  function navigate(page, examId) {
    location.href = `${page}?exam=${encodeURIComponent(examId)}`;
  }

  function resetGuideView() {
    guidePromptView.hidden = true;
    guideMainView.hidden = false;
    promptCopyStatus.textContent = '';
  }

  function openGuideDialog() {
    resetGuideView();
    if (!guideDialog.open) {
      guideDialog.showModal();
    }
  }

  async function deleteExam(examId) {
    const ok = confirm('PDF와 연결된 정답 파일을 삭제할까요?');
    if (!ok) return;
    await window.electronAPI.deletePDF(examId);
    await refreshList();
  }

  async function refreshList() {
    const files = await window.electronAPI.listPDFs();
    list.innerHTML = '';
    emptyState.hidden = files.length > 0;

    for (const file of files) {
      const examId = examIdFromFile(file);
      const saved = await window.electronAPI.loadAnswers(examId);
      const row = document.createElement('article');
      row.className = 'exam-row';

      const info = document.createElement('div');
      info.className = 'exam-info';

      const label = document.createElement('span');
      label.className = 'exam-label';
      label.textContent = saved?.label || examId;

      info.append(label);

      const startButton = document.createElement('button');
      startButton.type = 'button';
      startButton.className = 'icon-button primary-icon-button';
      startButton.dataset.tooltip = '시험 시작';
      startButton.setAttribute('aria-label', '시험 시작');
      startButton.title = '시험 시작';
      startButton.textContent = '▶';
      startButton.addEventListener('click', () => navigate('exam.html', examId));

      const editButton = document.createElement('button');
      editButton.type = 'button';
      editButton.className = 'icon-button secondary-button';
      editButton.dataset.tooltip = '정답 편집';
      editButton.setAttribute('aria-label', '정답 편집');
      editButton.title = '정답 편집';
      editButton.textContent = '✎';
      editButton.addEventListener('click', () => navigate('answer-editor.html', examId));

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'icon-button danger-button';
      deleteButton.dataset.tooltip = '삭제';
      deleteButton.setAttribute('aria-label', '삭제');
      deleteButton.title = '삭제';
      deleteButton.textContent = '×';
      deleteButton.addEventListener('click', () => deleteExam(examId));

      const historyButton = document.createElement('button');
      historyButton.type = 'button';
      historyButton.className = 'icon-button secondary-button';
      historyButton.dataset.tooltip = '기록';
      historyButton.setAttribute('aria-label', '기록');
      historyButton.title = '기록';
      historyButton.textContent = '◷';
      historyButton.addEventListener('click', () => navigate('history.html', examId));

      row.append(info, startButton, editButton, historyButton, deleteButton);
      list.appendChild(row);
    }
  }

  importButton.addEventListener('click', async () => {
    await window.electronAPI.importPDF();
    await refreshList();
  });

  answerImportButton.addEventListener('click', async () => {
    const imported = await window.electronAPI.importAnswers();
    await refreshList();
    if (imported.length > 0) {
      alert(`${imported.length}개 정답 파일을 가져왔습니다.`);
    }
  });

  guideDialog.addEventListener('close', () => {
    if (dontShowGuide.checked) {
      localStorage.setItem('hide-start-guide', '1');
    }
  });

  promptViewButton.addEventListener('click', () => {
    guideMainView.hidden = true;
    guidePromptView.hidden = false;
    promptCopyStatus.textContent = '';
  });

  promptBackButton.addEventListener('click', () => {
    guidePromptView.hidden = true;
    guideMainView.hidden = false;
    promptCopyStatus.textContent = '';
  });

  promptCopyButton.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(promptText.value);
      promptCopyStatus.textContent = '프롬프트를 복사했습니다.';
    } catch {
      promptText.select();
      document.execCommand('copy');
      promptCopyStatus.textContent = '프롬프트를 복사했습니다.';
    }
  });

  helpButton.addEventListener('click', openGuideDialog);

  await refreshList();

  if (localStorage.getItem('hide-start-guide') !== '1') {
    openGuideDialog();
  }
}());
