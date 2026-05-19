(function () {
  const LIMIT = 9000;
  let elapsed = 0;

  const display = document.getElementById('timer-display');
  const status = document.getElementById('timer-status');
  const overtime = document.getElementById('timer-overtime');

  if (!display || !status || !overtime) return;

  function fmt(sec) {
    return [
      Math.floor(sec / 3600),
      Math.floor((sec % 3600) / 60),
      sec % 60,
    ].map((value) => String(value).padStart(2, '0')).join(':');
  }

  function render() {
    if (elapsed <= LIMIT) {
      display.textContent = fmt(elapsed);
      status.textContent = '진행 중';
      overtime.textContent = '';
      return;
    }

    display.textContent = fmt(LIMIT);
    status.textContent = '시험 종료';
    overtime.textContent = `+${fmt(elapsed - LIMIT)}`;
  }

  render();
  setInterval(() => {
    elapsed += 1;
    render();
  }, 1000);
}());
