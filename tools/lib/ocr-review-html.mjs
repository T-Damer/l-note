import { OCR_REVIEW_KIND } from './ocr-review.mjs';

function reviewDataBase64(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64');
}

export function renderOcrReviewHtml(review) {
  if (review?.kind !== OCR_REVIEW_KIND) throw new TypeError('An OCR review is required.');
  const data = reviewDataBase64(review);
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Проверка OCR · L-Note</title>
  <style>
    :root { color-scheme: light dark; font-family: Inter, system-ui, sans-serif; }
    * { box-sizing: border-box; }
    body { max-width: 96rem; margin: 0 auto; padding: 1.2rem; background: Canvas; color: CanvasText; }
    header.page { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; }
    h1 { margin: 0 0 .35rem; font-size: clamp(1.6rem, 4vw, 2.5rem); }
    p { line-height: 1.5; }
    .muted { color: color-mix(in srgb, CanvasText 62%, Canvas); }
    .toolbar, .summary, .decision { display: flex; flex-wrap: wrap; gap: .45rem; }
    .toolbar { align-items: end; justify-content: flex-end; }
    .summary { margin: .9rem 0 1rem; }
    .pill { padding: .35rem .55rem; border: 1px solid color-mix(in srgb, CanvasText 22%, Canvas); border-radius: 999px; font-size: .8rem; }
    button, input, textarea { font: inherit; }
    button { min-height: 2.4rem; padding: .55rem .8rem; border: 1px solid color-mix(in srgb, CanvasText 24%, Canvas); border-radius: .65rem; background: CanvasText; color: Canvas; cursor: pointer; font-weight: 750; }
    .decision button { min-height: 2.15rem; background: Canvas; color: CanvasText; font-size: .78rem; }
    button[aria-pressed="true"] { background: CanvasText; color: Canvas; }
    button:disabled { opacity: .45; cursor: not-allowed; }
    label { display: grid; gap: .3rem; font-size: .78rem; font-weight: 750; }
    input { min-height: 2.4rem; padding: .5rem .65rem; border: 1px solid color-mix(in srgb, CanvasText 24%, Canvas); border-radius: .65rem; background: Canvas; color: CanvasText; }
    .candidate { display: grid; gap: .9rem; margin-bottom: 1rem; padding: 1rem; border: 1px solid color-mix(in srgb, CanvasText 22%, Canvas); border-radius: 1rem; }
    .candidate[data-decision="accept"] { border-color: #2f8f5b; }
    .candidate[data-decision="dismiss"] { opacity: .68; }
    .candidate.is-invalid { border-color: #ba3c3c; }
    .candidate > header { display: flex; justify-content: space-between; gap: .75rem; align-items: flex-start; }
    .candidate h2 { margin: 0 0 .2rem; font-size: 1.05rem; }
    .workspace { display: grid; grid-template-columns: minmax(20rem, 1fr) minmax(20rem, 1fr); gap: .9rem; min-height: 34rem; }
    iframe { width: 100%; height: 100%; min-height: 34rem; border: 1px solid color-mix(in srgb, CanvasText 20%, Canvas); border-radius: .75rem; background: white; }
    textarea { width: 100%; height: 100%; min-height: 34rem; padding: .75rem; border: 1px solid color-mix(in srgb, CanvasText 24%, Canvas); border-radius: .75rem; background: Canvas; color: CanvasText; font: 14px/1.55 ui-monospace, monospace; resize: vertical; }
    details { padding: .7rem; border-radius: .7rem; background: color-mix(in srgb, CanvasText 6%, Canvas); }
    table { width: 100%; border-collapse: collapse; font-size: .78rem; }
    th, td { padding: .3rem; border-bottom: 1px solid color-mix(in srgb, CanvasText 14%, Canvas); text-align: left; }
    .low { color: #ba3c3c; font-weight: 750; }
    .error { color: #ba3c3c; font-weight: 700; }
    @media (max-width: 820px) { header.page, .candidate > header, .workspace { display: grid; grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header class="page">
    <div>
      <h1>Проверка OCR</h1>
      <p class="muted">Сверьте страницу с распознанным текстом. Только принятый текст попадёт в пакет.</p>
    </div>
    <div class="toolbar">
      <label>Проверил(а)<input id="reviewer" autocomplete="name" placeholder="Имя или роль" /></label>
      <button id="download" type="button">Скачать результат</button>
    </div>
  </header>
  <div id="summary" class="summary"></div>
  <main id="candidates"></main>
  <script id="review-data" type="application/octet-stream">${data}</script>
  <script>
    const encoded = document.querySelector('#review-data').textContent.trim();
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    const review = JSON.parse(new TextDecoder().decode(bytes));
    const root = document.querySelector('#candidates');
    const summary = document.querySelector('#summary');
    const reviewer = document.querySelector('#reviewer');
    const decisionLabels = { pending: 'Не решено', accept: 'Принять', dismiss: 'Отклонить' };

    function node(tag, attributes = {}, children = []) {
      const value = document.createElement(tag);
      for (const [key, item] of Object.entries(attributes)) {
        if (key === 'text') value.textContent = item;
        else if (key === 'className') value.className = item;
        else if (key === 'disabled') value.disabled = Boolean(item);
        else value.setAttribute(key, item);
      }
      for (const child of [].concat(children).filter(Boolean)) value.append(child);
      return value;
    }

    function counts() {
      const output = { pending: 0, accept: 0, dismiss: 0 };
      for (const candidate of review.candidates) output[candidate.decision || 'pending'] += 1;
      return output;
    }

    function renderSummary() {
      const value = counts();
      summary.replaceChildren(
        node('span', { className: 'pill', text: 'Страниц: ' + review.candidates.length }),
        node('span', { className: 'pill', text: 'Принято: ' + value.accept }),
        node('span', { className: 'pill', text: 'Отклонено: ' + value.dismiss }),
        node('span', { className: 'pill', text: 'Не решено: ' + value.pending }),
      );
    }

    function setDecision(candidate, article, decision) {
      if (!candidate.eligible && decision === 'accept') return;
      candidate.decision = decision;
      article.dataset.decision = decision;
      for (const button of article.querySelectorAll('[data-decision]')) {
        button.setAttribute('aria-pressed', String(button.dataset.decision === decision));
      }
      renderSummary();
    }

    function confidenceTable(candidate) {
      const low = candidate.words.filter((word) => word.confidence < candidate.lowConfidenceThreshold);
      if (!low.length) return node('p', { className: 'muted', text: 'Слов с низкой уверенностью нет.' });
      const rows = low.slice(0, 200).map((word) => node('tr', {}, [
        node('td', { text: word.text }),
        node('td', { className: 'low', text: word.confidence.toFixed(1) }),
        node('td', { text: word.left + ',' + word.top + ' · ' + word.width + '×' + word.height }),
      ]));
      return node('table', {}, [
        node('thead', {}, [node('tr', {}, [node('th', { text: 'Слово' }), node('th', { text: 'Confidence' }), node('th', { text: 'Область' })])]),
        node('tbody', {}, rows),
      ]);
    }

    function card(candidate, index) {
      const article = node('article', { className: 'candidate' + (candidate.eligible ? '' : ' is-invalid') });
      article.dataset.decision = candidate.decision || 'pending';
      const decisions = node('div', { className: 'decision', role: 'group', 'aria-label': 'Решение' });
      for (const decision of ['pending', 'accept', 'dismiss']) {
        const button = node('button', {
          type: 'button',
          'data-decision': decision,
          'aria-pressed': String((candidate.decision || 'pending') === decision),
          text: decisionLabels[decision],
          disabled: !candidate.eligible && decision === 'accept',
        });
        button.addEventListener('click', () => setDecision(candidate, article, decision));
        decisions.append(button);
      }
      const area = node('textarea', { spellcheck: 'true', 'aria-label': 'Исправленный OCR-текст' });
      area.value = candidate.text || candidate.originalText || '';
      area.addEventListener('input', () => { candidate.text = area.value; });
      const pdfUrl = String(candidate.assetUrl || '').startsWith('./assets/')
        ? candidate.assetUrl + '#page=' + candidate.page
        : 'about:blank';
      const average = candidate.averageConfidence === null ? '—' : candidate.averageConfidence.toFixed(1);
      article.append(
        node('header', {}, [
          node('div', {}, [
            node('h2', { text: (index + 1) + '. ' + candidate.documentTitle + ' · страница ' + candidate.page }),
            node('div', { className: 'muted', text: candidate.sourcePath + ' · средняя уверенность ' + average + '% · низкая: ' + candidate.lowConfidenceWords }),
          ]),
          decisions,
        ]),
        candidate.validationError ? node('div', { className: 'error', text: candidate.validationError }) : null,
        node('section', { className: 'workspace' }, [
          node('iframe', { src: pdfUrl, title: candidate.documentTitle + ', страница ' + candidate.page }),
          area,
        ]),
        node('details', {}, [node('summary', { text: 'Слова с низкой уверенностью и координаты' }), confidenceTable(candidate)]),
      );
      return article;
    }

    root.replaceChildren(...review.candidates.map(card));
    renderSummary();
    document.querySelector('#download').addEventListener('click', () => {
      const unresolved = review.candidates.filter((candidate) => (candidate.decision || 'pending') === 'pending');
      if (unresolved.length) {
        alert('Остались страницы без решения: ' + unresolved.length);
        return;
      }
      const emptyAccepted = review.candidates.find((candidate) => candidate.decision === 'accept' && !String(candidate.text || '').trim());
      if (emptyAccepted) {
        alert('Принятый текст страницы ' + emptyAccepted.page + ' пуст.');
        return;
      }
      const now = new Date().toISOString();
      const reviewedBy = reviewer.value.trim() || 'local-reviewer';
      review.reviewedAt = now;
      review.reviewedBy = reviewedBy;
      for (const candidate of review.candidates) {
        candidate.reviewedAt = now;
        candidate.reviewedBy = reviewedBy;
      }
      const blob = new Blob([JSON.stringify(review, null, 2) + '\n'], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = node('a', { href: url, download: review.targetPackId + '.ocr-review.json' });
      anchor.click();
      URL.revokeObjectURL(url);
    });
  </script>
</body>
</html>\n`;
}
