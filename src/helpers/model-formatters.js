export function formatDurationMs(value) {
  if (!Number.isFinite(value)) return '—';
  if (value < 1000) return `${Math.round(value)} мс`;
  return `${(value / 1000).toFixed(value < 10_000 ? 1 : 0)} с`;
}

export function formatDownloadSpeed(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)} МБ/с` : 'скорость определяется';
}

export function formatGenerationSpeed(value) {
  return Number.isFinite(value) ? `${value.toFixed(1)} ток/с` : 'скорость не сообщена';
}

export function formatGigabytesFromMegabytes(value) {
  return `${(Number(value ?? 0) / 1024).toFixed(1)} ГБ`;
}

export function formatMegabytes(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  if (numeric >= 1024) return formatGigabytesFromMegabytes(numeric);
  return `${numeric >= 10 ? numeric.toFixed(0) : numeric.toFixed(1)} МБ`;
}
