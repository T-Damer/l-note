function reviewDataBase64(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
}

export function renderSemanticReviewHtml(review) {
  if (review?.kind !== 'lnote.semantic-proposal-review') {
    throw new TypeError('A semantic proposal review is required.');
  }
  const data = reviewDataBase64(review);
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Проверка разметки · L-Note</title>
  <style>
    :root { color-scheme: light dark; font-family: Inter, system-ui, sans-serif; }
    * { box-sizing: border-box; }
    body { max-width: 78rem; margin: 0 auto; padding: 1.25rem; background: Canvas; color: CanvasText; }
    .page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
    h1 { margin: 0 0 .35rem; font-size: clamp(1.6rem, 4vw, 2.6rem); }
    p { line-height: 1.55; }
    .muted { color: color-mix(in srgb, CanvasText 62%, Canvas); }
    .summary, .filters, .decision { display: flex; flex-wrap: wrap; gap: .45rem; }
    .summary { margin: .8rem 0; }
    .filters { margin: 0 0 1rem; }
    .pill { padding: .35rem .55rem; border: 1px solid color-mix(in srgb, CanvasText 22%, Canvas); border-radius: 999px; font-size: .8rem; }
    button { min-height: 2.45rem; padding: .55rem .8rem; border: 1px solid color-mix(in srgb, CanvasText 24%, Canvas); border-radius: .65rem; background: CanvasText; color: Canvas; cursor: pointer; font: inherit; font-weight: 750; }
    .filters button, .decision button { min-height: 2.15rem; background: Canvas; color: CanvasText; font-size: .78rem; }
    button[aria-pressed="true"] { background: CanvasText; color: Canvas; }
    .candidate { display: grid; gap: .85rem; margin-bottom: 1rem; padding: 1rem; border: 1px solid color-mix(in srgb, CanvasText 22%, Canvas); border-radius: 1rem; }
    .candidate[data-decision="accept"] { border-color: #2f8f5b; }
    .candidate[data-decision="dismiss"] { opacity: .66; }
    .candidate.is-invalid { border-color: #ba3c3c; }
    .candidate > header { display: flex; align-items: flex-start; justify-content: space-between; gap: .75rem; }
    .candidate h2 { margin: 0 0 .2rem; font-size: 1rem; }
    .source { padding: .8rem; border-radius: .75rem; background: color-mix(in srgb, CanvasText 6%, Canvas); }
    .source strong { display: block; margin-bottom: .35rem; }
    blockquote { margin: .55rem 0 0; padding-left: .7rem; border-left: 3px solid color-mix(in srgb, CanvasText 28%, Canvas); line-height: 1.55; white-space: pre-wrap; }
    label { display: grid; gap: .3rem; font-size: .78rem; font-weight: 750; }
    textarea { width: 100%; min-height: 9rem; padding: .7rem; border: 1px solid color-mix(in srgb, CanvasText 24%, Canvas); border-radius: .65rem; background: Canvas; color: CanvasText; font: 13px/1.5 ui-monospace, monospace; resize: vertical; }
    .error { color: #ba3c3c; font-weight: 700; }
    .empty { padding: 2rem; border: 1px dashed color-mix(in srgb, CanvasText 28%, Canvas); border-radius: 1rem; text-align: center; }
    @media (max-width: 700px) { .page-header, .candidate > header { display: grid; } }
  </style>
</head>
<body>
  <header class="page-header">
    <div>
      <h1>Проверка предложенной разметки</h1>
      <p class="muted">Модель ничего не добавляет автоматически. Проверьте понятия, утверждения и связи, затем скачайте результат.</p>
    </div>
    <button id="download" type="button">Скачать результат</button>
  </header>
  <div id="summary" class="summary"></div>
  <nav id="filters" class="filters" aria-label="Фильтр предложений"></nav>
  <main id="candidates"></main>
  <script id="review-data" type="application/octet-stream">${data}</script>
  <script>
    const encoded = document.querySelector('#review-data').textContent.trim();
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    const review = JSON.parse(new TextDecoder().decode(bytes));
    const kindLabels = { entity: 'Понятие', claim: 'Утверждение', relation: 'Связь' };
    const decisionLabels = { pending: 'Не решено', accept: 'Принять', dismiss: 'Отклонить' };
    const root = document.querySelector('#candidates');
    const summary = document.querySelector('#summary');
    const filters = document.querySelector('#filters');
    let activeFilter = 'all';

    function node(tag, attributes = {}, children = []) {
      const value = document.createElement(tag);
      for (const [key, item] of Object.entries(attributes)) {
        if (key === 'text') value.textContent = item;
        else if (key === 'className') value.className = item;
        else value.setAttribute(key, item);
      }
      for (const child of [].concat(children).filter(Boolean)) value.append(child);
      return value;
    }

    function setDecision(candidate, article, value) {
      if (!candidate.eligible && value === 'accept') return;
      candidate.decision = value;
      article.dataset.decision = value;
      for (const button of article.querySelectorAll('[data-decision]')) {
        button.setAttribute('aria-pressed', String(button.dataset.decision === value));
      }
      renderSummary();
    }

    function dataEditor(candidate) {
      const area = node('textarea', { spellcheck: 'false' });
      area.value = JSON.stringify(candidate.data, null, 2);
      area.addEventListener('change', () => {
        try {
          candidate.data = JSON.parse(area.value);
          area.setCustomValidity('');
        } catch {
          area.setCustomValidity('Исправьте JSON перед сохранением.');
          area.reportValidity();
        }
      });
      return node('label', {}, [node('span', { text: 'Редактируемые данные' }), area]);
    }

    function candidateCard(candidate, index) {
      const article = node('article', {
        className: 'candidate' + (candidate.eligible ? '' : ' is-invalid'),
        'data-kind': candidate.kind,
      });
      article.dataset.decision = candidate.decision || 'pending';
      const decisions = node('div', { className: 'decision', role: 'group', 'aria-label': 'Решение' });
      for (const value of ['pending', 'accept', 'dismiss']) {
        const button = node('button', {
          type: 'button',
          'data-decision': value,
          'aria-pressed': String((candidate.decision || 'pending') === value),
          text: decisionLabels[value],
        });
        if (!candidate.eligible && value === 'accept') button.disabled = true;
        button.addEventListener('click', () => setDecision(candidate, article, value));
        decisions.append(button);
      }
      const sourceChildren = [
        node('strong', { text: candidate.documentTitle + ' — ' + candidate.sectionTitle }),
      ];
      if (candidate.sourceQuote) sourceChildren.push(node('blockquote', { text: candidate.sourceQuote }));
      else sourceChildren.push(node('div', { className: 'muted', text: candidate.sourceContext }));
      article.append(
        node('header', {}, [
          node('div', {}, [
            node('h2', { text: (kindLabels[candidate.kind] || candidate.kind) + ' ' + (index + 1) }),
            node('div', { className: 'muted', text: candidate.documentTitle + ' · ' + candidate.sectionTitle }),
          ]),
          decisions,
        ]),
        candidate.validationError ? node('div', { className: 'error', text: candidate.validationError }) : null,
        node('section', { className: 'source' }, sourceChildren),
        dataEditor(candidate),
      );
      return article;
    }

    function renderCandidates() {
      const visible = review.candidates.filter((candidate) => activeFilter === 'all' || candidate.kind === activeFilter);
      root.replaceChildren(...visible.map(candidateCard));
      if (!visible.length) root.append(node('section', { className: 'empty', text: 'В этой группе нет предложений.' }));
    }

    function renderSummary() {
      const counts = { pending: 0, accept: 0, dismiss: 0 };
      for (const candidate of review.candidates) counts[candidate.decision || 'pending'] += 1;
      summary.replaceChildren(
        node('span', { className: 'pill', text: 'Всего: ' + review.candidates.length }),
        node('span', { className: 'pill', text: 'Принято: ' + counts.accept }),
        node('span', { className: 'pill', text: 'Отклонено: ' + counts.dismiss }),
        node('span', { className: 'pill', text: 'Не решено: ' + counts.pending }),
      );
    }

    for (const [value, label] of [['all', 'Все'], ['entity', 'Понятия'], ['claim', 'Утверждения'], ['relation', 'Связи']]) {
      const button = node('button', { type: 'button', 'aria-pressed': String(value === activeFilter), text: label });
      button.addEventListener('click', () => {
        activeFilter = value;
        for (const item of filters.querySelectorAll('button')) item.setAttribute('aria-pressed', String(item === button));
        renderCandidates();
      });
      filters.append(button);
    }

    renderSummary();
    renderCandidates();
    document.querySelector('#download').addEventListener('click', () => {
      const invalidEditor = [...document.querySelectorAll('textarea')].find((area) => !area.checkValidity());
      if (invalidEditor) { invalidEditor.reportValidity(); return; }
      const blob = new Blob([JSON.stringify(review, null, 2) + '\n'], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = node('a', { href: url, download: review.targetPackId + '.semantic-review.json' });
      anchor.click();
      URL.revokeObjectURL(url);
    });
  </script>
</body>
</html>\n`;
}
