# Database adapters

## Scope

The database adapter is a strong-device preparation and interchange tool. It does not add a database connection to the hosted browser runtime.

Implemented commands use the built-in Node.js `node:sqlite` module and therefore require Node.js 22 or newer.

```bash
npm run database:pack -- <command> [options]
```

## Inspect an arbitrary SQLite database

```bash
npm run database:pack -- inspect \
  --input ./reference.sqlite
```

The command lists user tables and views with column type, nullability, primary-key order and hidden/generated-column metadata. SQLite internal objects are excluded.

Write machine-readable inspection output:

```bash
npm run database:pack -- inspect \
  --input ./reference.sqlite \
  --output ./reference.schema.json
```

The database is opened read-only. Extension loading and double-quoted string literals are disabled.

## Import arbitrary tables or views

```bash
npm run database:pack -- import \
  --input ./reference.sqlite \
  --output ./prepared/reference \
  --id com.example.reference \
  --title "Reference database"
```

Without `--table`, every non-internal table and view becomes one L-Note document. Every row becomes one or more source sections. The importer writes the ordinary authoring layout:

```text
prepared/reference/
  manifest.json
  entities.json
  claims.json
  relations.json
  documents/
    doc-table-a.json
    doc-view-b.json
```

Compile and review it through the existing workflow:

```bash
npm run build:pack -- \
  --input ./prepared/reference \
  --output ./dist/reference.pack.json
```

Select several objects explicitly:

```bash
npm run database:pack -- import \
  --input ./reference.sqlite \
  --output ./prepared/reference \
  --id com.example.reference \
  --table articles \
  --table glossary
```

### Column mapping

A mapping keeps SQL identifiers separate from SQL text. It cannot inject a custom `WHERE`, expression or query; selected names must exist in the inspected schema.

```json
{
  "tables": {
    "articles": {
      "documentTitle": "Articles",
      "documentSummary": "Reviewed article archive",
      "idColumns": ["id"],
      "orderColumns": ["id"],
      "titleColumn": "title",
      "textColumns": ["title", "body", "author"],
      "tagColumns": ["category", "status"]
    }
  }
}
```

Apply it:

```bash
npm run database:pack -- import \
  --input ./reference.sqlite \
  --output ./prepared/reference \
  --id com.example.reference \
  --mapping ./sqlite-mapping.json
```

When no identity columns are configured, primary-key columns are used. `orderColumns` defaults to the selected identity columns. Ordinary tables without either use `rowid`; views without a stable identity/order emit a warning and should configure `orderColumns` explicitly. Duplicate mapped identities are retained with a row-number suffix and a warning rather than silently overwriting a section.

### Provenance and limits

Every imported section records:

- database filename, table/view and visible column schema;
- row number, selected identity columns and ordering columns;
- exact columns included in the searchable text;
- preparation timestamp and `node:sqlite` adapter name.

BLOB values are not copied into source text. They are represented by byte length and SHA-256. Text values are preserved up to the configured cell limit, with an explicit warning when truncated.

Default limits:

- 50,000 rows per table or view;
- 100,000 characters per text cell;
- 5,000 characters per generated section.

Override them with `--max-rows`, `--max-cell-chars`, and `--max-section-chars`. Large rows are split into several sections with the same provenance.

## Export a pack to relational SQLite

```bash
npm run database:pack -- export \
  --input ./dist/reference.pack.json \
  --output ./dist/reference.pack.sqlite
```

The output contains:

- `lnote_metadata` with the source-preserving pack manifest and relational schema version;
- ordered document and section tables;
- entities, claims, entity relations and reviewed statement relations;
- JSON payload columns that preserve fields outside the normalized columns, including an explicitly empty `statementRelations` array;
- `lnote_sections_fts`, a standalone FTS5 index for external inspection and SQL queries.

Example query:

```sql
SELECT document_id, section_id, title
FROM lnote_sections_fts
WHERE lnote_sections_fts MATCH 'offline';
```

The relational database is an interchange/export representation. It is not the prebuilt browser search artifact described in `PACK_FORMAT.md`.

## Restore an exported pack

```bash
npm run database:pack -- restore \
  --input ./dist/reference.pack.sqlite \
  --output ./dist/reference.restored.pack.json
```

Restore accepts only the versioned L-Note relational schema. It rebuilds document nesting and record order from stored payload rows, preserves optional-array presence, then validates the result through the ordinary pack validator.

## DuckDB and remote databases

DuckDB is intentionally not a required dependency. For large imports, use it externally to scan SQLite/PostgreSQL/MySQL/ODBC or to convert CSV/JSON/Parquet into a smaller SQLite staging database, then run the L-Note importer.

This keeps:

- the repository dependency-free beyond existing packages;
- remote credentials outside L-Note;
- bulk scanning and Parquet conversion in a tool designed for them;
- the L-Note adapter focused on provenance, review and portable pack contracts.

Future adapters may invoke DuckDB as an optional executable, but they must still emit the same authoring directory and review artifacts.
