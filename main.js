const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const Store = require('electron-store');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const vm = require('vm');

const store = new Store({ name: 'user-answers' });

let pdfsDir;
let answersDir;

function ensureDataDirs() {
  const userDataPath = app.getPath('userData');
  pdfsDir = path.join(userDataPath, 'pdfs');
  answersDir = path.join(userDataPath, 'answers');
  fs.mkdirSync(pdfsDir, { recursive: true });
  fs.mkdirSync(answersDir, { recursive: true });
}

function isDeletedBundledExam(examId) {
  const deleted = store.get('deletedBundledExams', []);
  return deleted.includes(examId);
}

function rememberDeletedBundledExam(examId) {
  const deleted = store.get('deletedBundledExams', []);
  if (!deleted.includes(examId)) {
    store.set('deletedBundledExams', [...deleted, examId]);
  }
}

function labelFromExamId(examId) {
  const match = /^(\d{4})_(\d+)$/.exec(examId);
  if (!match) return examId;
  return `${match[1]}년 ${match[2]}회`;
}

function answersFromJsFile(src) {
  const context = {};
  const source = fs.readFileSync(src, 'utf8');
  vm.createContext(context);
  vm.runInContext(source, context);
  if (!context.answers) return null;

  const answers = {};
  for (const [key, value] of Object.entries(context.answers)) {
    answers[String(key)] = Number(value);
  }
  return answers;
}

function migrateBundledData() {
  const bundledPdfsDir = path.join(__dirname, 'pdfs');
  const bundledAnswersDir = path.join(__dirname, 'answers');

  if (fs.existsSync(bundledPdfsDir)) {
    for (const file of fs.readdirSync(bundledPdfsDir)) {
      if (!file.toLowerCase().endsWith('.pdf')) continue;
      const examId = safeExamId(file.replace(/\.pdf$/i, ''));
      if (isDeletedBundledExam(examId)) continue;
      const src = path.join(bundledPdfsDir, file);
      const dest = path.join(pdfsDir, file);
      if (!fs.existsSync(dest)) fs.copyFileSync(src, dest);
    }
  }

  if (fs.existsSync(bundledAnswersDir)) {
    for (const file of fs.readdirSync(bundledAnswersDir)) {
      if (!file.toLowerCase().endsWith('.js')) continue;

      const examId = safeExamId(file.replace(/\.js$/i, ''));
      if (isDeletedBundledExam(examId)) continue;
      const dest = path.join(answersDir, `${examId}.json`);
      if (fs.existsSync(dest)) continue;

      const answers = answersFromJsFile(path.join(bundledAnswersDir, file));
      if (!answers) continue;

      fs.writeFileSync(dest, JSON.stringify({
        label: labelFromExamId(examId),
        questionCount: Object.keys(answers).length,
        answers,
      }, null, 2), 'utf8');
    }
  }
}

function safeExamId(examId) {
  return path.basename(String(examId || '').replace(/\.pdf$/i, ''))
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .trim();
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 640,
    icon: path.join(__dirname, 'files', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  ensureDataDirs();
  migrateBundledData();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('pdf:import', async () => {
  const result = await dialog.showOpenDialog({
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
    properties: ['openFile', 'multiSelections'],
  });

  if (result.canceled) return [];

  return result.filePaths.map((src) => {
    const name = path.basename(src);
    const examId = safeExamId(name);
    const dest = path.join(pdfsDir, name);
    fs.copyFileSync(src, dest);
    const deleted = store.get('deletedBundledExams', []);
    store.set('deletedBundledExams', deleted.filter((id) => id !== examId));
    return name;
  });
});

ipcMain.handle('answers:import', async () => {
  const result = await dialog.showOpenDialog({
    filters: [
      { name: 'Answer Files', extensions: ['json', 'js'] },
      { name: 'JSON', extensions: ['json'] },
      { name: 'JavaScript', extensions: ['js'] },
    ],
    properties: ['openFile', 'multiSelections'],
  });

  if (result.canceled) return [];

  const imported = [];
  for (const src of result.filePaths) {
    const ext = path.extname(src).toLowerCase();
    const examId = safeExamId(path.basename(src, ext));
    const dest = path.join(answersDir, `${examId}.json`);
    let payload;

    if (ext === '.json') {
      const parsed = JSON.parse(fs.readFileSync(src, 'utf8'));
      const answers = parsed.answers || parsed;
      payload = {
        label: parsed.label || labelFromExamId(examId),
        questionCount: parsed.questionCount || Object.keys(answers).length,
        answers,
      };
    } else if (ext === '.js') {
      const answers = answersFromJsFile(src);
      if (!answers) continue;
      payload = {
        label: labelFromExamId(examId),
        questionCount: Object.keys(answers).length,
        answers,
      };
    } else {
      continue;
    }

    fs.writeFileSync(dest, JSON.stringify(payload, null, 2), 'utf8');
    imported.push({ examId, label: payload.label });
  }

  return imported;
});

ipcMain.handle('pdf:list', () => {
  return fs.readdirSync(pdfsDir)
    .filter((file) => file.toLowerCase().endsWith('.pdf'))
    .sort((a, b) => a.localeCompare(b));
});

ipcMain.handle('pdf:getPath', (_event, examId) => {
  const id = safeExamId(examId);
  const pdfPath = path.join(pdfsDir, `${id}.pdf`);
  if (!fs.existsSync(pdfPath)) return null;
  return pathToFileURL(pdfPath).toString();
});

ipcMain.handle('pdf:delete', (_event, examId) => {
  const id = safeExamId(examId);
  const pdfPath = path.join(pdfsDir, `${id}.pdf`);
  const answerPath = path.join(answersDir, `${id}.json`);

  if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
  if (fs.existsSync(answerPath)) fs.unlinkSync(answerPath);
  store.delete(`answers.${id}`);
  store.delete(`history.${id}`);
  rememberDeletedBundledExam(id);
  return true;
});

ipcMain.handle('answers:save', (_event, examId, data) => {
  const id = safeExamId(examId);
  const answerPath = path.join(answersDir, `${id}.json`);
  fs.writeFileSync(answerPath, JSON.stringify(data, null, 2), 'utf8');
  return true;
});

ipcMain.handle('answers:load', (_event, examId) => {
  const id = safeExamId(examId);
  const answerPath = path.join(answersDir, `${id}.json`);
  if (!fs.existsSync(answerPath)) return null;
  return JSON.parse(fs.readFileSync(answerPath, 'utf8'));
});

ipcMain.handle('userAnswers:save', (_event, examId, data) => {
  const id = safeExamId(examId);
  store.set(`answers.${id}`, data || {});
  return true;
});

ipcMain.handle('userAnswers:load', (_event, examId) => {
  const id = safeExamId(examId);
  return store.get(`answers.${id}`, {});
});

ipcMain.handle('history:save', (_event, examId, data) => {
  const id = safeExamId(examId);
  const list = store.get(`history.${id}`, []);
  const next = Array.isArray(list) ? list : [];
  next.unshift({
    id: `${Date.now()}`,
    ...data,
  });
  store.set(`history.${id}`, next);
  return true;
});

ipcMain.handle('history:load', (_event, examId) => {
  const id = safeExamId(examId);
  return store.get(`history.${id}`, []);
});
