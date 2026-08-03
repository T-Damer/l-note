import assert from 'node:assert/strict';
import test from 'node:test';

import {
  pdfInspectorPages,
  pdfInspectorSections,
  stripPdfSelfLinks,
} from '../src/helpers/pdf-inspector-result.js';

test('removes navigation back into the current PDF but keeps visible labels', () => {
  const source = [
    'См. [раздел 4](#page=4).',
    'Открыть [таблицу](report.pdf#page=12).',
    'Вернуться к [приложению](https://example.test/files/report.pdf?download=1#page=20).',
  ].join('\n');

  const text = stripPdfSelfLinks(source, { sourceFilename: 'report.pdf' });
  assert.equal(text, [
    'См. раздел 4.',
    'Открыть таблицу.',
    'Вернуться к приложению.',
  ].join('\n'));
});

test('drops a standalone self-URL annotation and keeps inline text readable', () => {
  const source = [
    '[https://example.test/report.pdf](https://example.test/report.pdf)',
    '',
    'Источник: [https://example.test/report.pdf](https://example.test/report.pdf).',
  ].join('\n');

  assert.equal(
    stripPdfSelfLinks(source, { sourceFilename: 'report.pdf' }),
    'Источник: https://example.test/report.pdf.',
  );
});

test('preserves external links and image syntax', () => {
  const source = [
    '[Внешний источник](https://example.test/other.pdf)',
    '![Диаграмма](report.pdf#image=1)',
  ].join('\n');

  assert.equal(stripPdfSelfLinks(source, { sourceFilename: 'report.pdf' }), source);
});

test('uses parser source metadata before creating page sections', () => {
  const result = {
    sourceFilename: 'report.pdf',
    pageCount: 1,
    pagesNeedingOcr: [],
    markdown: [
      '<!-- Page 1 -->',
      '[Оглавление](#page=1)',
      '[Другой документ](other.pdf)',
      '[report.pdf](report.pdf#page=1)',
    ].join('\n'),
  };

  assert.equal(pdfInspectorPages(result)[0].markdown, [
    'Оглавление',
    '[Другой документ](other.pdf)',
  ].join('\n'));
  assert.equal(pdfInspectorSections(result)[0].text, [
    'Оглавление',
    '[Другой документ](other.pdf)',
  ].join('\n'));
});

test('recognizes the exact source URL independently from its filename', () => {
  const source = '[Текущая версия](https://example.test/document/current#section-2)';
  assert.equal(
    stripPdfSelfLinks(source, { sourceUrl: 'https://example.test/document/current?download=1' }),
    'Текущая версия',
  );
});
