# Retrieval and knowledge-system research

## Decision

L-Note keeps its portable JSON pack, exact source quotes, reviewed statement relations and browser-native search runtime as the product boundary.

External GraphRAG and memory systems may be added as **optional preparation or server adapters**. They must export into L-Note review artifacts and may not silently rewrite source documents, accept generated claims, resolve a discrepancy or become required by the offline client.

## Constraints that drive the decision

L-Note must support:

- static hosting and offline browser use;
- weak devices with bounded JavaScript memory;
- exact evidence quotes and stable source routes;
- independently installable packs;
- deterministic search without an LLM;
- personal notes separated from reference material;
- several disagreeing sources without automatically choosing a winner;
- optional strong-device preparation and local-model assistance.

These requirements differ from the usual server-side agent-memory use case.

## Systems reviewed

### Microsoft GraphRAG

GraphRAG provides a configurable indexing pipeline that extracts entities, relationships and optional claims, performs community detection, creates summaries and stores tabular index outputs. Its local-search design combines graph data with original text chunks and then builds a bounded context window.

Useful for L-Note:

- optional high-quality entity and relation proposals;
- claim proposal generation for later exact-quote review;
- corpus-wide community summaries for large server installations;
- preparation-time context-builder ideas.

Not suitable as the browser runtime:

- Python and batch-oriented execution;
- substantial LLM indexing cost;
- generated summaries are not source-of-truth evidence;
- default outputs and query engine require a larger server-side stack.

Official references:

- https://microsoft.github.io/graphrag/index/overview/
- https://microsoft.github.io/graphrag/index/methods/
- https://microsoft.github.io/graphrag/query/local_search/

### Graphiti

Graphiti models entities, facts and source episodes in a temporal context graph. Facts may carry validity windows, remain traceable to raw episodes and be retrieved through semantic, keyword and graph traversal methods.

Useful for L-Note:

- provenance terminology: every derived fact should trace to an immutable source episode;
- explicit validity windows and historical queries;
- incremental preparation for frequently changing data;
- optional server-side temporal relation proposals.

Important mismatch:

Graphiti is designed to invalidate an older fact when a newer fact supersedes it. L-Note often needs to retain several simultaneously authoritative editions, jurisdictions or professional opinions. Therefore automatic invalidation cannot replace reviewed `statementRelations`. Temporal dates may become candidate signals, but they do not choose a winning source.

Graphiti also requires a Python service, graph backend and reliable structured-output model, so it is not a static-browser dependency.

Official reference:

- https://github.com/getzep/graphiti

### Cognee

Cognee combines relational provenance, vector retrieval and graph storage. It provides local defaults and higher-level ingestion, graph construction and recall operations.

Useful for L-Note:

- a possible self-hosted preparation service for heterogeneous files and databases;
- reusable ingestion and entity extraction pipelines;
- an optional memory/search service for teams that do not require a pure static client;
- local deployment with replaceable relational, vector and graph backends.

Not suitable as the required runtime:

- Python service and several storage layers;
- embeddings and LLM processing are central to its normal workflow;
- its generated graph would still require L-Note exact-quote and human-review gates;
- it does not remove the need for the portable pack and offline search contract.

Official references:

- https://docs.cognee.ai/core-concepts/overview
- https://docs.cognee.ai/getting-started/installation

### Neo4j GraphRAG and property-graph frameworks

Neo4j GraphRAG provides maintained server-side retrievers, vector-plus-graph traversal and an experimental knowledge-graph builder. Property-graph frameworks such as LlamaIndex offer similar orchestration around graph construction and query.

Useful for L-Note:

- optional server edition with custom graph traversal;
- import/export adapter target;
- complex multi-hop queries over very large organizational corpora;
- experimentation with vector-first entry points followed by constrained graph expansion.

Not suitable as the default runtime:

- requires a graph server or additional infrastructure;
- approximate vector retrieval cannot replace deterministic exact/prefix/fuzzy search;
- graph construction still depends on schema, extraction and review policy;
- native browser/offline deployment is not the primary design target.

Official reference:

- https://neo4j.com/docs/neo4j-graphrag-python/current/

## Adopted architecture

```text
raw sources
  → deterministic extraction and provenance
  → optional external proposal adapter
       GraphRAG / Cognee / Graphiti / custom LLM
  → L-Note JSON or HTML review artifact
  → explicit human decisions
  → portable source-preserving pack
  → optional prebuilt FTS artifact
  → offline browser runtime
```

Query-time context assembly:

```text
query
  → deterministic text retrieval
  → ordinary source sections [S1...]
  → bounded reviewed relation expansion
  → missing counterpart sections become ordinary [S...] sources
  → exact discrepancy quotes and dates
  → personal notes in a separate layer
  → local model, if enabled
  → citation and statement-support verification
```

## Invariants

1. Raw source text remains immutable evidence.
2. Generated summaries and extracted graph nodes are proposals or acceleration data.
3. A confirmed discrepancy includes both citable source sides.
4. Dates are evidence metadata, not automatic precedence.
5. `proposed` and `dismissed` relations never enter answer context.
6. Retrieval expansion is bounded independently from primary search results.
7. The local model cannot cite a relation without also receiving both source fragments.
8. External systems integrate through adapters and review files, not through hidden runtime coupling.

## Recommended next integrations

1. Define a generic preparation-adapter contract that accepts source records and returns semantic/discrepancy proposals.
2. Prototype a Cognee adapter for database and heterogeneous-document ingestion.
3. Prototype a GraphRAG adapter for large static corpora and community summaries.
4. Add optional validity intervals and edition chronology to reviewed statement relations.
5. Add a server-side graph retriever only after benchmarking the current text-plus-reviewed-edge baseline.
