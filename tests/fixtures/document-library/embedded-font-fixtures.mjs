function bytes(value) {
  return Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'latin1');
}

function pdfStream(dictionary, body) {
  const data = bytes(body);
  return Buffer.concat([
    bytes(`<< ${dictionary} /Length ${data.length} >>\nstream\n`),
    data,
    bytes('\nendstream'),
  ]);
}

function serializePdf(objects) {
  const header = Buffer.concat([
    bytes('%PDF-1.4\n'),
    Buffer.from([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]),
  ]);
  const chunks = [header];
  const offsets = [0];
  let offset = header.length;
  for (const [index, body] of objects.entries()) {
    const object = Buffer.concat([
      bytes(`${index + 1} 0 obj\n`),
      bytes(body),
      bytes('\nendobj\n'),
    ]);
    offsets.push(offset);
    chunks.push(object);
    offset += object.length;
  }
  const xrefOffset = offset;
  chunks.push(bytes([
    `xref\n0 ${objects.length + 1}\n`,
    '0000000000 65535 f \n',
    ...offsets.slice(1).map((value) => `${String(value).padStart(10, '0')} 00000 n \n`),
  ].join('')));
  chunks.push(bytes(
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`
    + `startxref\n${xrefOffset}\n%%EOF\n`,
  ));
  return Buffer.concat(chunks);
}

function glyphName(code) {
  return code === 32 ? 'space' : `g${code.toString(16).padStart(2, '0')}`;
}

function hexText(value) {
  return Buffer.from(value, 'ascii').toString('hex').toUpperCase();
}

function toUnicodeCmap(codes) {
  const mappings = codes.map((code) => (
    `<${code.toString(16).padStart(2, '0').toUpperCase()}> `
      + `<${code.toString(16).padStart(4, '0').toUpperCase()}>`
  ));
  return [
    '/CIDInit /ProcSet findresource begin',
    '12 dict begin',
    'begincmap',
    '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def',
    '/CMapName /LNoteType3 def',
    '/CMapType 2 def',
    '1 begincodespacerange',
    '<00> <FF>',
    'endcodespacerange',
    `${mappings.length} beginbfchar`,
    ...mappings,
    'endbfchar',
    'endcmap',
    'CMapName currentdict /CMap defineresource pop',
    'end',
    'end',
  ].join('\n');
}

function textContent(lines) {
  const output = ['BT', '/F1 14 Tf', '54 730 Td'];
  for (const [index, line] of lines.entries()) {
    if (index) output.push('0 -30 Td');
    output.push(`<${hexText(line)}> Tj`);
  }
  output.push('ET');
  return output.join('\n');
}

export function embeddedType3FontPdf({ withToUnicode = true } = {}) {
  const lines = [
    'EMBEDDED FONT TEXT',
    'CUSTOM TYPE THREE GLYPHS USE TO UNICODE',
    'SEARCHABLE SOURCE TEXT REMAINS AVAILABLE',
    'THE ORIGINAL PAGE IS THE VISUAL AUTHORITY',
    'ENCODING PROVENANCE MUST REMAIN EXPLICIT',
    'BROKEN TEXT MUST NEVER ENTER SEARCH EVIDENCE',
  ];
  const codes = [...new Set(lines.join('').split('').map((character) => character.charCodeAt(0)))].sort((a, b) => a - b);
  const glyphRefs = new Map();
  let nextObject = 5;
  for (const code of codes) {
    glyphRefs.set(code, nextObject);
    nextObject += 1;
  }
  const cmapRef = withToUnicode ? nextObject++ : null;
  const contentRef = nextObject;
  const charProcs = codes.map((code) => `/${glyphName(code)} ${glyphRefs.get(code)} 0 R`).join(' ');
  const differences = codes.map((code) => `${code} /${glyphName(code)}`).join(' ');
  const firstChar = Math.min(...codes);
  const lastChar = Math.max(...codes);
  const widths = Array.from({ length: lastChar - firstChar + 1 }, () => '600').join(' ');
  const font = [
    '<< /Type /Font /Subtype /Type3 /Name /F1',
    '/FontBBox [0 0 600 700]',
    '/FontMatrix [0.001 0 0 0.001 0 0]',
    `/CharProcs << ${charProcs} >>`,
    `/Encoding << /Type /Encoding /Differences [${differences}] >>`,
    `/FirstChar ${firstChar} /LastChar ${lastChar}`,
    `/Widths [${widths}]`,
    '/Resources << >>',
    withToUnicode ? `/ToUnicode ${cmapRef} 0 R` : '',
    '>>',
  ].filter(Boolean).join(' ');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents ${contentRef} 0 R >>`,
    font,
  ];
  for (const code of codes) {
    objects.push(pdfStream('', code === 32 ? '600 0 d0' : '600 0 d0\n40 40 500 620 re S'));
  }
  if (withToUnicode) objects.push(pdfStream('', toUnicodeCmap(codes)));
  objects.push(pdfStream('', textContent(lines)));
  return serializePdf(objects);
}
