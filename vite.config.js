const { defineConfig } = require('vite');
const { resolve } = require('path');

module.exports = defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'pwa-dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        root: resolve(__dirname, 'index.html'),
        index: resolve(__dirname, 'renderer/index.html'),
        exam: resolve(__dirname, 'renderer/exam.html'),
        answerEditor: resolve(__dirname, 'renderer/answer-editor.html'),
        history: resolve(__dirname, 'renderer/history.html'),
      },
    },
  },
});
