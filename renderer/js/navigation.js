export function createQuestionNavigation(options) {
  const container = options.container;
  const onSelect = options.onSelect;
  let questionCount = 0;
  let currentQuestion = 1;
  let answers = {};
  let reviews = {};
  let results = {};

  function render() {
    if (!container) return;
    container.innerHTML = '';
    for (let q = 1; q <= questionCount; q += 1) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'question-nav-button';
      button.textContent = String(q);
      button.dataset.q = String(q);
      if (answers[String(q)] !== undefined) button.classList.add('answered');
      if (reviews[String(q)]) button.classList.add('review');
      if (currentQuestion === q) button.classList.add('current');
      if (results[String(q)] === true) button.classList.add('correct');
      if (results[String(q)] === false) button.classList.add('wrong');
      button.addEventListener('click', () => onSelect(q));
      container.appendChild(button);
    }
  }

  return {
    init(count) {
      questionCount = count;
      render();
    },
    setState(nextState) {
      currentQuestion = nextState.currentQuestion ?? currentQuestion;
      answers = nextState.answers || answers;
      reviews = nextState.reviews || reviews;
      results = nextState.results || results;
      render();
    },
  };
}
