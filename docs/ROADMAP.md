# Roadmap

## Current web MVP

- selectable, checksummed packs;
- local import;
- fuzzy/token search and abbreviation suggestions;
- exact source navigation;
- entity, claim and relation views;
- separate personal notes and personal claims;
- evidence bundle generation;
- optional two-pass local OpenAI-compatible inference;
- PWA shell and GitHub Pages deployment.

## Next

1. Move pack payloads from JSON to SQLite with FTS5 and optional vector tables.
2. Add a desktop/server compiler for Markdown, PDF, DOCX, CSV, JSON and databases.
3. Add optional Replicate/local-LLM extraction proposals with a review queue.
4. Add a WebLLM adapter for fully browser-local inference on supported WebGPU devices.
5. Wrap the client with Capacitor, then replace hot paths with native Android storage and llama.cpp.
6. Add signed catalogs, dependency resolution, delta updates and pack namespaces.
