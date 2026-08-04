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
  return serializePdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] '
      + '/Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] '
      + '/Resources << /XObject << /Im1 7 0 R >> >> /Contents 8 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    pdfStream('', 'BT\n/F1 18 Tf\n72 720 Td\n(TEXT LAYER PAGE ONE) Tj\nET'),
    imageObject(),
    pdfStream('', 'q\n512 0 0 512 50 140 cm\n/Im1 Do\nQ'),
  ]);
}

export function multiColumnPdf() {
  const content = [
    'BT',
    '/F1 12 Tf',
    '72 720 Td',
    '(LEFT COLUMN ALPHA) Tj',
    '0 -24 Td',
    '(LEFT COLUMN OMEGA) Tj',
    'ET',
    'BT',
    '/F1 12 Tf',
    '330 720 Td',
    '(RIGHT COLUMN ALPHA) Tj',
    '0 -24 Td',
    '(RIGHT COLUMN OMEGA) Tj',
    'ET',
  ].join('\n');
  return serializePdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] '
      + '/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    pdfStream('', content),
  ]);
}
