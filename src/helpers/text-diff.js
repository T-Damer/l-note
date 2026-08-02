const TOKEN_PATTERN = /\s+|[\p{L}\p{N}]+|[^\p{L}\p{N}\s]+/gu;
const MAX_LCS_TOKENS = 180;

function tokens(value) {
  return String(value ?? '').match(TOKEN_PATTERN) ?? [];
}

function normalizedToken(value) {
  return String(value).normalize('NFKC').toLocaleLowerCase('ru-RU');
}

function mergeSegments(values) {
  const output = [];
  for (const value of values) {
    if (!value.text) continue;
    const last = output.at(-1);
    if (last?.changed === value.changed) last.text += value.text;
    else output.push({ ...value });
  }
  return output;
}

function middleFallback(left, right) {
  let prefix = 0;
  const shortest = Math.min(left.length, right.length);
  while (prefix < shortest && normalizedToken(left[prefix]) === normalizedToken(right[prefix])) prefix += 1;
  let suffix = 0;
  while (
    suffix < shortest - prefix
    && normalizedToken(left[left.length - 1 - suffix]) === normalizedToken(right[right.length - 1 - suffix])
  ) suffix += 1;

  function segments(values) {
    const end = values.length - suffix;
    return mergeSegments([
      { text: values.slice(0, prefix).join(''), changed: false },
      { text: values.slice(prefix, end).join(''), changed: true },
      { text: values.slice(end).join(''), changed: false },
    ]);
  }
  return { left: segments(left), right: segments(right) };
}

export function diffTextSegments(leftValue, rightValue) {
  const left = tokens(leftValue);
  const right = tokens(rightValue);
  if (left.length > MAX_LCS_TOKENS || right.length > MAX_LCS_TOKENS) {
    return middleFallback(left, right);
  }

  const matrix = Array.from({ length: left.length + 1 }, () => new Uint16Array(right.length + 1));
  for (let leftIndex = left.length - 1; leftIndex >= 0; leftIndex -= 1) {
    for (let rightIndex = right.length - 1; rightIndex >= 0; rightIndex -= 1) {
      matrix[leftIndex][rightIndex] = normalizedToken(left[leftIndex]) === normalizedToken(right[rightIndex])
        ? matrix[leftIndex + 1][rightIndex + 1] + 1
        : Math.max(matrix[leftIndex + 1][rightIndex], matrix[leftIndex][rightIndex + 1]);
    }
  }

  const leftSegments = [];
  const rightSegments = [];
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length || rightIndex < right.length) {
    const same = leftIndex < left.length
      && rightIndex < right.length
      && normalizedToken(left[leftIndex]) === normalizedToken(right[rightIndex]);
    if (same) {
      leftSegments.push({ text: left[leftIndex], changed: false });
      rightSegments.push({ text: right[rightIndex], changed: false });
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }
    if (
      rightIndex < right.length
      && (leftIndex >= left.length || matrix[leftIndex][rightIndex + 1] >= matrix[leftIndex + 1][rightIndex])
    ) {
      rightSegments.push({ text: right[rightIndex], changed: true });
      rightIndex += 1;
      continue;
    }
    leftSegments.push({ text: left[leftIndex], changed: true });
    leftIndex += 1;
  }

  return {
    left: mergeSegments(leftSegments),
    right: mergeSegments(rightSegments),
  };
}
