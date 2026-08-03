const SQLITE_WASM_VERSION = '1.3.1';
const SQLITE_WASM_MODULE = `https://cdn.jsdelivr.net/npm/@subframe7536/sqlite-wasm@${SQLITE_WASM_VERSION}/+esm`;
const SQLITE_WASM_IDB_MODULE = `https://cdn.jsdelivr.net/npm/@subframe7536/sqlite-wasm@${SQLITE_WASM_VERSION}/idb/+esm`;

export const SQLITE_WASM_URL = `https://cdn.jsdelivr.net/npm/@subframe7536/sqlite-wasm@${SQLITE_WASM_VERSION}/dist/wa-sqlite-async.wasm`;

function moduleFunction(module, name) {
  const candidate = module?.[name] ?? module?.default?.[name];
  if (typeof candidate !== 'function') {
    throw new Error(`${name} is not exported by the SQLite ESM module`);
  }
  return candidate;
}

export async function loadSqliteRuntimeModules({
  moduleUrl = SQLITE_WASM_MODULE,
  idbModuleUrl = SQLITE_WASM_IDB_MODULE,
} = {}) {
  const [sqliteModule, idbModule] = await Promise.all([
    import(moduleUrl),
    import(idbModuleUrl),
  ]);
  return {
    initSQLite: moduleFunction(sqliteModule, 'initSQLite'),
    withExistDB: moduleFunction(sqliteModule, 'withExistDB'),
    useIdbStorage: moduleFunction(idbModule, 'useIdbStorage'),
  };
}
