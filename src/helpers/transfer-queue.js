export function transferAbortError(message = 'Операция отменена.') {
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
}

export function transferMetadata(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
}

export function transferTaskOrder(left, right) {
  return right.priority - left.priority
    || left.createdAt.localeCompare(right.createdAt)
    || left.id.localeCompare(right.id);
}
