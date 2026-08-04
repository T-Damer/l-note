import { slugify } from './pack-builder.mjs';
import {
  formatCell,
  jsonSafe,
  quoteIdentifier,
  rowStableId,
  splitSection,
} from './sqlite-adapter-common.mjs';

function visibleColumns(columns) {
  return columns.filter((column) => column.hidden !== 1);
}

function assertColumnsExist(table, columns, requested, label) {
  const available = new Set(columns.map((column) => column.name));
  for (const name of requested ?? []) {
    if (!available.has(name)) throw new Error(`${table}: unknown ${label} column ${name}`);
  }
}

function tablePlan(object, mapping) {
  const columns = visibleColumns(object.columns);
  const columnNames = columns.map((column) => column.name);
  const primaryKeyColumns = columns
    .filter((column) => column.primaryKeyOrder > 0)
    .sort((left, right) => left.primaryKeyOrder - right.primaryKeyOrder)
    .map((column) => column.name);
  const idColumns = mapping.idColumns ?? primaryKeyColumns;
  const orderColumns = mapping.orderColumns ?? idColumns;
  const textColumns = mapping.textColumns ?? columnNames;
  const tagColumns = mapping.tagColumns ?? [];
  const titleColumn = mapping.titleColumn ?? null;
  assertColumnsExist(object.name, columns, idColumns, 'identity');
  assertColumnsExist(object.name, columns, orderColumns, 'order');
  assertColumnsExist(object.name, columns, textColumns, 'text');
  assertColumnsExist(object.name, columns, tagColumns, 'tag');
  if (titleColumn) assertColumnsExist(object.name, columns, [titleColumn], 'title');
  return {
    columns,
    idColumns,
    orderColumns,
    textColumns,
    tagColumns,
    titleColumn,
    documentTitle: mapping.documentTitle ?? object.name,
    documentSummary: mapping.documentSummary ?? `Импортировано из SQLite ${object.type} ${object.name}`,
  };
}

function rowIdentity(row, idColumns) {
  return Object.fromEntries(idColumns.map((column) => [column, jsonSafe(row[column])]));
}

function rowTitle(plan, row, identity, rowNumber) {
  const explicit = plan.titleColumn ? formatCell(row[plan.titleColumn]).text.trim() : '';
  if (explicit && explicit !== '(null)') return explicit.slice(0, 180);
  const identityText = Object.values(identity).filter((value) => value !== null).join(' · ');
  return `${plan.documentTitle} · ${identityText || `строка ${rowNumber}`}`;
}

function rowText(plan, row, options, warnings, table, rowNumber) {
  const blocks = [];
  for (const column of plan.textColumns) {
    const formatted = formatCell(row[column], { maxChars: options.maxCellChars });
    if (formatted.truncated) warnings.push(`${table}, строка ${rowNumber}, ${column}: значение обрезано.`);
    const separator = formatted.text.includes('\n') ? ':\n' : ': ';
    blocks.push(`${column}${separator}${formatted.text}`);
  }
  return blocks.join('\n\n') || '(пустая строка)';
}

function rowTags(plan, row, object) {
  const tags = ['sqlite', object.type, object.name];
  for (const column of plan.tagColumns) {
    const value = row[column];
    if (value === null || value instanceof Uint8Array) continue;
    tags.push(...String(value).split(/[,;|]/gu).map((item) => item.trim()).filter(Boolean));
  }
  return [...new Set(tags)];
}

function selectSql(object, plan, warnings) {
  if (plan.orderColumns.length) {
    return `SELECT * FROM ${quoteIdentifier(object.name)} ORDER BY ${plan.orderColumns.map(quoteIdentifier).join(', ')}`;
  }
  if (object.type === 'table') return `SELECT * FROM ${quoteIdentifier(object.name)} ORDER BY rowid`;
  warnings.push(`${object.name}: порядок строк view не определён; задайте orderColumns в mapping.`);
  return `SELECT * FROM ${quoteIdentifier(object.name)}`;
}

function uniqueRowId(object, identity, rowNumber, usedIds, warnings) {
  let id = rowStableId(object.name, identity, rowNumber);
  if (usedIds.has(id)) {
    warnings.push(`${object.name}, строка ${rowNumber}: identity не уникален; ID дополнен номером строки.`);
    id = rowStableId(object.name, { ...identity, __rowNumber: rowNumber }, rowNumber);
  }
  usedIds.add(id);
  return id;
}

function emptySection(object) {
  return {
    id: 'empty',
    title: 'Нет строк',
    text: `${object.name} не содержит строк.`,
    entityIds: [],
    tags: ['sqlite', object.type, object.name],
    provenance: { kind: 'sqlite-empty', table: object.name, objectType: object.type },
  };
}

function documentFor(object, plan, sections, options, truncated) {
  const staging = options.stageSources.get(object.name);
  return {
    id: `doc.${slugify(object.name)}`,
    title: plan.documentTitle,
    summary: plan.documentSummary,
    authority: 'reference',
    effectiveFrom: null,
    source: {
      title: object.name,
      databaseFile: options.databaseFile,
      databaseType: 'sqlite',
      objectType: object.type,
      adapter: 'node:sqlite',
      preparedAt: options.generatedAt,
      columns: plan.columns,
      orderColumns: plan.orderColumns,
      ...(staging ? { staging } : {}),
    },
    tags: ['sqlite', object.type, object.name, ...(staging ? [staging.sourceType, 'duckdb-stage'] : [])],
    sections,
    ...(truncated ? { extractionWarnings: [`Импорт ограничен ${options.maxRowsPerTable} строками.`] } : {}),
  };
}

export function importSqliteObject(database, object, mapping, options, warnings, onProgress) {
  const plan = tablePlan(object, mapping);
  const sections = [];
  const usedIds = new Set();
  const statement = database.prepare(selectSql(object, plan, warnings));
  let rowNumber = 0;
  let truncated = false;
  for (const row of statement.iterate()) {
    rowNumber += 1;
    if (rowNumber > options.maxRowsPerTable) {
      truncated = true;
      break;
    }
    const identity = rowIdentity(row, plan.idColumns);
    const metadata = {
      provenance: {
        kind: 'sqlite-row',
        table: object.name,
        objectType: object.type,
        rowNumber,
        identity,
        columns: plan.textColumns,
        orderColumns: plan.orderColumns,
      },
    };
    const rowSections = splitSection({
      id: uniqueRowId(object, identity, rowNumber, usedIds, warnings),
      title: rowTitle(plan, row, identity, rowNumber),
      text: rowText(plan, row, options, warnings, object.name, rowNumber),
      maxChars: options.maxSectionChars,
      metadata,
    });
    for (const section of rowSections) section.tags = rowTags(plan, row, object);
    sections.push(...rowSections);
    if (rowNumber % 500 === 0) onProgress({ stage: 'rows', table: object.name, rows: rowNumber });
  }
  if (truncated) warnings.push(`${object.name}: импорт ограничен ${options.maxRowsPerTable} строками.`);
  if (!sections.length) sections.push(emptySection(object));
  return documentFor(object, plan, sections, options, truncated);
}
