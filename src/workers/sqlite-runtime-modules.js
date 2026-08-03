const SQLITE_WASM_VERSION = '1.3.1';
const SQLITE_WASM_MODULE = `https://esm.run/@subframe7536/sqlite-wasm@${SQLITE_WASM_VERSION}`;
const SQLITE_WASM_IDB_MODULE = `${SQLITE_WASM_MODULE}/idb`;

export const SQLITE_WASM_URL = `https://cdn.jsdelivr.net/npm/@subframe7536/sqlite-wasm@${SQLITE_WASM_VERSION}/dist/wa-sqlite-async.wasm`;

function exportNames(module) {
  const named = Object.keys(module ?? {}).join(',') || 'none';
  const defaults = Object.keys(module?.default ?? {}).join(',') || 'none';
  return `named=[${named}], default=[${defaults}]`;
}

function moduleFunction(module, name) {
  const candidate = module?.[name] ?? module?.default?.[name];
  if (typeof candidate !== 'function') {
    throw new Error(`${name} is not exported by the SQLite ESM module (${exportNames(module)})`);
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
