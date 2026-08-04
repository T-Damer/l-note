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
  const xref = [
    `xref\n0 ${objects.length + 1}\n`,
    '0000000000 65535 f \n',
    ...offsets.slice(1).map((value) => `${String(value).padStart(10, '0')} 00000 n \n`),
  ].join('');
  chunks.push(bytes(xref));
  chunks.push(bytes(
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`
    + `startxref\n${xrefOffset}\n%%EOF\n`,
  ));
  return Buffer.concat(chunks);
}

function checkerboard(width = 64, height = 64) {
  const output = Buffer.alloc(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      output[y * width + x] = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 ? 32 : 224;
    }
  }
  return output;
}

function imageObject(width = 64, height = 64) {
  return pdfStream(
    `/Type /XObject /Subtype /Image /Width ${width} /Height ${height}`
      + ' /ColorSpace /DeviceGray /BitsPerComponent 8',
    checkerboard(width, height),
  );
}

function textBlock(lines, { x, y, size = 12, leading = 18 } = {}) {
  const output = ['BT', `/F1 ${size} Tf`, `${x} ${y} Td`];
  for (const [index, line] of lines.entries()) {
    if (index) output.push(`0 -${leading} Td`);
    output.push(`(${line}) Tj`);
  }
  output.push('ET');
  return output.join('\n');
}

export function imageOnlyPdf() {
  return serializePdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] '
      + '/Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>',
    imageObject(),
    pdfStream('', 'q\n512 0 0 512 50 140 cm\n/Im1 Do\nQ'),
  ]);
}

export function mixedTextAndImagePdf() {
  const text = textBlock([
    'TEXT LAYER PAGE ONE',
    'This page contains a reliable searchable text layer.',
    'The acceptance corpus checks page aware extraction.',
    'Tables and images are tested in separate cases.',
    'A scanned page follows this ordinary text page.',
    'The parser must not route this page to OCR.',
    'Source anchors remain attached to page number one.',
    'Historical source text must remain unchanged.',
  ], { x: 72, y: 720, size: 12, leading: 22 });
  return serializePdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] '
      + '/Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] '
      + '/Resources << /XObject << /Im1 7 0 R >> >> /Contents 8 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    pdfStream('', text),
    imageObject(),
    pdfStream('', 'q\n512 0 0 512 50 140 cm\n/Im1 Do\nQ'),
  ]);
}

export function multiColumnPdf() {
  const left = textBlock([
    'LEFT COLUMN ALPHA',
    'Left column sentence one.',
    'Left column sentence two.',
    'Left column sentence three.',
    'LEFT COLUMN OMEGA',
  ], { x: 54, y: 720, size: 11, leading: 20 });
  const right = textBlock([
    'RIGHT COLUMN ALPHA',
    'Right column sentence one.',
    'Right column sentence two.',
    'Right column sentence three.',
    'RIGHT COLUMN OMEGA',
  ], { x: 326, y: 720, size: 11, leading: 20 });
  return serializePdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] '
      + '/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    pdfStream('', `${left}\n${right}`),
  ]);
}
