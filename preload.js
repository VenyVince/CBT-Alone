const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  importPDF: () => ipcRenderer.invoke('pdf:import'),
  importAnswers: () => ipcRenderer.invoke('answers:import'),
  listPDFs: () => ipcRenderer.invoke('pdf:list'),
  getPDFPath: (examId) => ipcRenderer.invoke('pdf:getPath', examId),
  deletePDF: (examId) => ipcRenderer.invoke('pdf:delete', examId),
  saveAnswers: (examId, data) => ipcRenderer.invoke('answers:save', examId, data),
  loadAnswers: (examId) => ipcRenderer.invoke('answers:load', examId),
  saveUserAnswers: (examId, data) => ipcRenderer.invoke('userAnswers:save', examId, data),
  loadUserAnswers: (examId) => ipcRenderer.invoke('userAnswers:load', examId),
  saveHistory: (examId, data) => ipcRenderer.invoke('history:save', examId, data),
  loadHistory: (examId) => ipcRenderer.invoke('history:load', examId),
});
