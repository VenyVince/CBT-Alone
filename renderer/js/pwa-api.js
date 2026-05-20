(function () {
  if (window.electronAPI) return;

  const DB_NAME = 'cbt-pwa';
  const DB_VERSION = 1;
  const stores = ['pdfs', 'answers', 'userAnswers', 'history', 'questionMap'];

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        stores.forEach((name) => {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
        });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function withStore(name, mode, callback) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(name, mode);
      const store = tx.objectStore(name);
      const result = callback(store);
      tx.oncomplete = () => {
        db.close();
        resolve(result);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    });
  }

  function requestToPromise(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function getValue(storeName, key, fallback = null) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const request = tx.objectStore(storeName).get(key);
      request.onsuccess = () => resolve(request.result ?? fallback);
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => db.close();
      tx.onerror = () => db.close();
    });
  }

  function chooseFiles(accept, multiple = true) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = accept;
      input.multiple = multiple;
      input.style.display = 'none';
      document.body.appendChild(input);
      input.addEventListener('change', () => {
        const files = Array.from(input.files || []);
        input.remove();
        resolve(files);
      }, { once: true });
      input.click();
    });
  }

  function examIdFromName(name) {
    return String(name || '')
      .replace(/\.pdf$/i, '')
      .replace(/\.(json|js)$/i, '')
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
      .trim();
  }

  function labelFromExamId(examId) {
    const match = /^(\d{4})_(\d+)$/.exec(examId);
    return match ? `${match[1]}년 ${match[2]}회` : examId;
  }

  function parseJsAnswers(source) {
    const match = /(?:var|let|const)\s+answers\s*=\s*({[\s\S]*?})\s*;?\s*$/.exec(source.trim());
    if (!match) return null;
    const objectSource = match[1]
      .replace(/([{,]\s*)(\d+)\s*:/g, '$1"$2":')
      .replace(/,\s*}/g, '}');
    return JSON.parse(objectSource);
  }

  async function saveValue(storeName, key, value) {
    await withStore(storeName, 'readwrite', (store) => store.put(value, key));
    return true;
  }

  async function deleteValue(storeName, key) {
    await withStore(storeName, 'readwrite', (store) => store.delete(key));
    return true;
  }

  window.electronAPI = {
    async importPDF() {
      const files = await chooseFiles('application/pdf,.pdf', true);
      const names = [];
      for (const file of files) {
        await saveValue('pdfs', file.name, {
          name: file.name,
          type: file.type || 'application/pdf',
          buffer: await file.arrayBuffer(),
        });
        names.push(file.name);
      }
      return names;
    },
    async importAnswers() {
      const files = await chooseFiles('.json,.js,application/json,text/javascript', true);
      const imported = [];
      for (const file of files) {
        const examId = examIdFromName(file.name);
        const text = await file.text();
        const ext = file.name.toLowerCase().split('.').pop();
        let payload = null;

        if (ext === 'json') {
          const parsed = JSON.parse(text);
          const answers = parsed.answers || parsed;
          payload = {
            label: parsed.label || labelFromExamId(examId),
            questionCount: parsed.questionCount || Object.keys(answers).length,
            answers,
          };
        } else if (ext === 'js') {
          const answers = parseJsAnswers(text);
          if (answers) {
            payload = {
              label: labelFromExamId(examId),
              questionCount: Object.keys(answers).length,
              answers,
            };
          }
        }

        if (payload) {
          await saveValue('answers', examId, payload);
          imported.push({ examId, label: payload.label });
        }
      }
      return imported;
    },
    async listPDFs() {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('pdfs', 'readonly');
        const request = tx.objectStore('pdfs').getAllKeys();
        request.onsuccess = () => resolve(request.result.sort((a, b) => String(a).localeCompare(String(b))));
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => db.close();
        tx.onerror = () => db.close();
      });
    },
    async getPDFPath(examId) {
      const record = await getValue('pdfs', `${examId}.pdf`);
      if (!record) return null;
      return URL.createObjectURL(new Blob([record.buffer], { type: record.type || 'application/pdf' }));
    },
    async getPDFBuffer(examId) {
      const record = await getValue('pdfs', `${examId}.pdf`);
      return record?.buffer || null;
    },
    async deletePDF(examId) {
      await deleteValue('pdfs', `${examId}.pdf`);
      await deleteValue('answers', examId);
      await deleteValue('userAnswers', examId);
      await deleteValue('history', examId);
      await deleteValue('questionMap', examId);
      return true;
    },
    saveAnswers: (examId, data) => saveValue('answers', examId, data),
    loadAnswers: (examId) => getValue('answers', examId, null),
    saveUserAnswers: (examId, data) => saveValue('userAnswers', examId, data || {}),
    loadUserAnswers: (examId) => getValue('userAnswers', examId, {}),
    async saveHistory(examId, data) {
      const list = await getValue('history', examId, []);
      const next = Array.isArray(list) ? list : [];
      next.unshift({ id: `${Date.now()}`, ...data });
      await saveValue('history', examId, next);
      return true;
    },
    loadHistory: (examId) => getValue('history', examId, []),
    saveQuestionMap: (examId, data) => saveValue('questionMap', examId, {
      ...(data || {}),
      savedAt: new Date().toISOString(),
    }),
    loadQuestionMap: (examId) => getValue('questionMap', examId, null),
  };
}());
