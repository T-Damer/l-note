function escapeJsonForHtml(value) {
  return JSON.stringify(value)
    .replaceAll('&', '\u0026')
    .replaceAll('<', '\u003c')
    .replaceAll('>', '\u003e')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');
}

export function renderDiscrepancyReviewHtml(review) {
  if (review?.kind !== 'lnote.statement-relation-review') {
    throw new TypeError('A statement-relation review is required.');
  }
  const data = escapeJsonForHtml(review);
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Проверка расхождений · L-Note</title>
  <style>
    :root { color-scheme: light dark; font-family: Inter, system-ui, sans-serif; }
    * { box-sizing: border-box; }
    body { max-width: 76rem; margin: 0 auto; padding: 1.25rem; background: Canvas; color: CanvasText; }
    header.page { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
    h1 { margin: 0 0 .35rem; font-size: clamp(1.6rem, 4vw, 2.6rem); }
    p { line-height: 1.55; }
    .muted { color: color-mix(in srgb, CanvasText 62%, Canvas); }
    .summary { display: flex; flex-wrap: wrap; gap: .5rem; margin: .8rem 0 1.2rem; }
    .pill { padding: .35rem .55rem; border: 1px solid color-mix(in srgb, CanvasText 20%, Canvas); border-radius: 999px; font-size: .8rem; }
    .candidate { display: grid; gap: .9rem; margin: 0 0 1rem; padding: 1rem; border: 1px solid color-mix(in srgb, CanvasText 22%, Canvas); border-radius: 1rem; }
    .candidate[data-decision="accept"] { border-color: #2f8f5b; }
    .candidate[data-decision="dismiss"] { opacity: .7; }
    .candidate > header { display: flex; justify-content: space-between; gap: .8rem; }
    .candidate h2 { margin: 0; font-size: 1rem; }
    .sources { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .75rem; }
    .source { min-width: 0; padding: .8rem; border-radius: .75rem; background: color-mix(in srgb, CanvasText 6%, Canvas); }
    .source h3 { margin: 0 0 .2rem; font-size: .9rem; }
    blockquote { margin: .65rem 0 0; padding-left: .7rem; border-left: 3px solid color-mix(in srgb, CanvasText 28%, Canvas); line-height: 1.55; white-space: pre-wrap; }
    .controls { display: grid; grid-template-columns: minmax(12rem, .7fr) minmax(12rem, .7fr) minmax(16rem, 1.6fr); gap: .65rem; }
    label { display: grid; gap: .25rem; font-size: .78rem; font-weight: 700; }
    select, textarea, button { font: inherit; }
    select, textarea { width: 100%; padding: .6rem .7rem; border: 1px solid color-mix(in srgb, CanvasText 24%, Canvas); border-radius: .6rem; background: Canvas; color: CanvasText; }
    textarea { min-height: 4.5rem; resize: vertical; }
    button { min-height: 2.6rem; padding: .6rem .85rem; border: 1px solid color-mix(in srgb, CanvasText 24%, Canvas); border-radius: .65rem; background: CanvasText; color: Canvas; cursor: pointer; font-weight: 750; }
    .decision { display: flex; flex-wrap: wrap; gap: .35rem; }
    .decision button { min-height: 2.25rem; background: Canvas; color: CanvasText; font-size: .78rem; }
    .decision button[aria-pressed="true"] { background: CanvasText; color: Canvas; }
    .empty { padding: 2rem; border: 1px dashed color-mix(in srgb, CanvasText 28%, Canvas); border-radius: 1rem; text-align: center; }
    @media (max-width: 760px) { .sources, .controls { grid-template-columns: 1fr; } header.page { display: grid; } }
  </style>
</head>
<body>
  <header class="page">
    <div>
      <h1>Проверка разных сведений</h1>
      <p class="muted">Сравните источники и подтвердите только те связи, которые действительно проверены. Эта страница не выбирает правильный документ автоматически.</p>
    </div>
    <button id="download" type="button">Скачать результат</button>
  </header>
  <div id="summary" class="summary"></div>
  <main id="candidates"></main>
  <script id="review-data" type="application/json">${data}</script>
  <script>
    const review = JSON.parse(document.querySelector('#review-data').textContent);
    const allowedTypes = [
      ['contradicts', 'Противоречит'],
      ['different_scope', 'Разные условия'],
      ['refines', 'Уточняет'],
      ['supports', 'Поддерживает'],
      ['equivalent', 'То же утверждение'],
      ['supersedes', 'Заменяет после проверки'],
    ];
    const decisionLabels = { pending: 'Не решено', accept: 'Принять', dismiss: 'Отклонить' };
    const root = document.querySelector('#candidates');
    const summary = document.querySelector('#summary');

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

    function sourceCard(side) {
      return node('section', { className: 'source' }, [
        node('h3', { text: side.documentTitle || 'Документ' }),
        node('div', { className: 'muted', text: [side.packTitle, side.date].filter(Boolean).join(' · ') }),
        node('blockquote', { text: side.quote || side.text || '' }),
      ]);
    }

    function setDecision(candidate, article, value) {
      candidate.decision = value;
      article.dataset.decision = value;
      for (const button of article.querySelectorAll('[data-decision]')) {
        button.setAttribute('aria-pressed', String(button.dataset.decision === value));
      }
      renderSummary();
    }

    function candidateCard(candidate, index) {
      const article = node('article', { className: 'candidate' });
      article.dataset.decision = candidate.decision || 'pending';
      const decisions = node('div', { className: 'decision', role: 'group', 'aria-label': 'Решение' });
      for (const value of ['pending', 'accept', 'dismiss']) {
        const button = node('button', {
          type: 'button',
          'data-decision': value,
          'aria-pressed': String((candidate.decision || 'pending') === value),
          text: decisionLabels[value],
        });
        button.addEventListener('click', () => setDecision(candidate, article, value));
        decisions.append(button);
      }
      const type = node('select');
      for (const [value, label] of allowedTypes) {
        const option = node('option', { value, text: label });
        type.append(option);
      }
      type.value = candidate.selectedType || candidate.suggestedType || 'contradicts';
      type.addEventListener('change', () => { candidate.selectedType = type.value; });
      const reason = node('textarea', { text: candidate.reason || '' });
      reason.addEventListener('input', () => { candidate.reason = reason.value; });
      article.append(
        node('header', {}, [
          node('div', {}, [
            node('h2', { text: 'Сопоставление ' + (index + 1) }),
            node('div', { className: 'muted', text: Math.round((candidate.confidence || 0) * 100) + '% · ' + (candidate.signals || []).join(', ') }),
          ]),
          decisions,
        ]),
        node('div', { className: 'sources' }, [sourceCard(candidate.source), sourceCard(candidate.target)]),
        node('div', { className: 'controls' }, [
          node('label', {}, [node('span', { text: 'Решение' }), node('div', { className: 'muted', text: decisionLabels[candidate.decision || 'pending'] })]),
          node('label', {}, [node('span', { text: 'Тип связи' }), type]),
          node('label', {}, [node('span', { text: 'Причина' }), reason]),
        ]),
      );
      return article;
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

    if (review.candidates.length === 0) {
      root.append(node('section', { className: 'empty', text: 'Возможные расхождения не найдены.' }));
    } else {
      root.append(...review.candidates.map(candidateCard));
    }
    renderSummary();

    document.querySelector('#download').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(review, null, 2) + '\n'], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = node('a', { href: url, download: review.targetPackId + '.discrepancy-review.json' });
      anchor.click();
      URL.revokeObjectURL(url);
    });
  </script>
</body>
</html>\n`;
}
