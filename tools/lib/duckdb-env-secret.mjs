export function duckDbEnvironmentExpression(environmentName, { integer = false } = {}) {
  const name = String(environmentName ?? '').trim();
  if (!/^[A-Z_][A-Z0-9_]*$/u.test(name)) {
    throw new Error('DuckDB secret environment variable name is invalid.');
  }
  const expression = `getenv('${name}')`;
  return integer ? `CAST(${expression} AS INTEGER)` : expression;
}
