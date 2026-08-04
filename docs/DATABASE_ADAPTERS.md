# Database adapters

## Scope

Database adapters are strong-device preparation and interchange tools. They do not add database connections to the hosted browser runtime.

SQLite import/export uses the built-in Node.js `node:sqlite` module and therefore requires Node.js 22 or newer. DuckDB staging is optional and invokes a separately installed `duckdb` executable; it is not an npm or browser dependency.

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

## Stage bulk and remote sources through optional DuckDB

DuckDB is an optional scanner that converts supported sources into one versioned SQLite staging database. The ordinary SQLite importer remains the source-preserving L-Note boundary.

Install the DuckDB command-line executable separately and verify it:

```bash
npm run database:pack -- duckdb-info
```

A staging config is declarative and versioned. It cannot contain raw SQL, predicates, connection strings or inline passwords.

```json
{
  "schemaVersion": 1,
  "kind": "lnote.duckdb-stage",
  "sources": [
    {
      "type": "csv",
      "path": "./articles.csv",
      "table": "articles",
      "options": {
        "header": true,
        "all_varchar": true
      }
    },
    {
      "type": "parquet",
      "path": "./archive/*.parquet",
      "table": "archive",
      "options": {
        "union_by_name": true,
        "filename": true
      }
    },
    {
      "type": "sqlite",
      "path": "./legacy.sqlite",
      "alias": "legacy",
      "tables": [
        { "source": "glossary", "target": "legacy_glossary" }
      ]
    },
    {
      "type": "postgres",
      "alias": "reference_db",
      "secretEnv": {
        "host": "REFERENCE_DB_HOST",
        "port": "REFERENCE_DB_PORT",
        "database": "REFERENCE_DB_NAME",
        "user": "REFERENCE_DB_USER",
        "password": "REFERENCE_DB_PASSWORD"
      },
      "tables": [
        { "source": "public.guidelines", "target": "guidelines" }
      ]
    }
  ]
}
```

MySQL uses the same shape with `"type": "mysql"`. Remote credentials are read from the named environment variables; credential values are not written into staging provenance.

Create the staging database:

```bash
npm run database:pack -- stage \
  --config ./duckdb-stage.json \
  --output ./prepared/staging.sqlite
```

Use `--duckdb-bin /path/to/duckdb` for a non-standard executable path. An existing target is rejected unless `--force` is supplied.

The bridge:

- starts DuckDB with an intentionally empty init file instead of a user's `~/.duckdbrc`;
- disables unsigned/community extensions and implicit extension loading;
- allowlists reader options for CSV, JSON and Parquet;
- opens SQLite/PostgreSQL/MySQL attachments read-only;
- limits execution time and captured process output;
- verifies staging schema metadata and every expected target table;
- deletes partial output after failure.

The staging database contains `lnote_stage_metadata` and `lnote_stage_sources`. During the next import, L-Note automatically carries the source type, locator, safe declarative config and staging timestamp into each generated document.

Continue through the ordinary pipeline:

```bash
npm run database:pack -- import \
  --input ./prepared/staging.sqlite \
  --output ./prepared/reference \
  --id com.example.reference \
  --title "Reference database"

npm run build:pack -- \
  --input ./prepared/reference \
  --output ./dist/reference.pack.json
```

DuckDB is preparation infrastructure, not evidence and not a runtime database. The source-preserving pack remains authoritative.

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
