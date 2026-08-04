# Performance benchmarks

## Purpose

L-Note chooses between in-memory MiniSearch and disk-backed SQLite/FTS5. The current threshold is a conservative implementation default, not a measured universal optimum.

Use the browser-local benchmark before changing that threshold. Desktop CI results validate the harness but do not define mobile product defaults.

## Open the benchmark

With the development server:

```bash
npm run serve
```

Open:

```text
http://127.0.0.1:4173/benchmarks/search.html
```

The exact port is printed by the server. The same page is included in the static build and GitHub Pages deployment under `/benchmarks/search.html`.

The page can be installed into the existing offline shell. Its SQLite data uses the isolated storage name `l-note-search-benchmark.db`; it never opens or clears the production `l-note-search.db` index.

## Default run

The default matrix uses:

- 1,000 records;
- 5,000 records;
- 10,000 records;
- 640 body characters per record;
- five repetitions of the deterministic query set.

Each case measures:

1. deterministic record generation and estimated corpus bytes;
2. MiniSearch construction;
3. MiniSearch query latency;
4. fresh SQLite/FTS5 construction in a Dedicated Worker;
5. SQLite query latency;
6. close and persisted reopen through the IndexedDB VFS;
7. query latency after reopen;
8. storage cleanup.

Query statistics include sample count, mean, p50, p95 and maximum duration. The report also records available device and heap signals.

## Device matrix

Collect at least three clean reports per profile:

| Profile | Minimum target |
| --- | --- |
| Android 8 GB | Snapdragon 7-class or comparable mid-range device |
| Android 12 GB | Snapdragon 7-class or comparable device with more memory headroom |
| Desktop reference | Current Chromium on a development workstation |

Optional additional profiles:

- older 6 GB Android devices;
- low-power tablets and e-ink Android devices;
- iOS Safari, noting that the SQLite WASM/IndexedDB path may behave differently;
- Firefox as a compatibility reference.

Record the exact browser version and whether battery saver, thermal throttling or background applications were active.

## Repeatable procedure

1. Close unrelated heavy browser tabs and applications.
2. Disable battery saver for the duration of the run.
3. Keep the device connected to power if that does not trigger a different performance mode.
4. Open the benchmark in a fresh tab.
5. Run the default matrix once as warm-up and discard that report.
6. Reload the page.
7. Run the default matrix three times, reloading between runs.
8. Export every JSON report without editing it.
9. Repeat with 30,000 records only when the default matrix completes without tab termination or severe thermal throttling.
10. Use 100,000 records only as a stress test; it is not required for the first mobile threshold decision.

Do not switch applications or lock the screen during a case. The Stop button requests cancellation after the current operation; it cannot interrupt a synchronous MiniSearch build already executing on the main thread.

## Reading the report

Important fields:

- `estimatedBytes`: deterministic estimate used by the adaptive search selector;
- `miniSearch.buildMs`: synchronous in-memory index construction;
- `miniSearch.query.p95Ms`: high-percentile interactive query latency;
- `sqlite.buildMs`: fresh worker/VFS FTS construction;
- `sqlite.reopenMs`: persisted-index reuse cost after closing the first worker;
- `sqlite.query.p95Ms`: query latency after a fresh build;
- `sqlite.reopenQuery.p95Ms`: query latency after persisted reopen;
- `heapBefore` / `heapAfterBuild`: Chromium heap signals when exposed;
- `preciseMemoryBefore` / `preciseMemoryAfter`: available only in supported cross-origin-isolated contexts;
- `freshStats` / `reopenStats`: SQLite version, token count, fingerprint and reuse metadata.

Browser heap APIs are incomplete and vary by engine. Treat missing heap values as unavailable, not zero. Tab termination, operating-system low-memory kills and severe UI stalls are stronger safety signals than one noisy heap sample.

## Threshold decision rule

Do not tune from one fastest result. A new threshold should satisfy all of these:

- MiniSearch p95 remains comfortably interactive below the threshold;
- synchronous MiniSearch build does not create a visible long task that makes common mobile UI feel frozen;
- no tested 8 GB device terminates or reloads the tab below the threshold;
- SQLite persisted reopen is materially cheaper than rebuilding the corresponding MiniSearch corpus above the threshold;
- results are directionally consistent across at least three runs on both 8 GB and 12 GB Android profiles;
- the chosen value retains a safety margin rather than matching the first observed failure point.

When record-count and byte thresholds disagree, prefer the earlier disk switch unless repeated device data shows it is unnecessarily conservative.

Any threshold change must include:

- the anonymized benchmark reports used for the decision;
- a short summary of median and worst observed values;
- the exact devices and browsers tested;
- updated adaptive-search tests;
- confirmation that search remains usable without a language model.

## Limitations

The synthetic corpus is deterministic and useful for backend comparison, but it does not represent every real library. It has regular field sizes and predictable term distribution.

Before a stable release, repeat measurements with prepared personal-library corpora that include:

- many short sections;
- fewer long sections;
- Cyrillic and Latin mixed text;
- aliases and typo-heavy queries;
- personal notes in addition to reference records;
- optional prebuilt SQLite artifacts.

The benchmark currently measures search backend behavior. PDF extraction, OCR, Whisper and WebLLM require separate device harnesses because their memory and thermal profiles differ substantially.
