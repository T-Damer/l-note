# Large-corpus retrieval and answer acceptance

## Purpose

The document-format corpus verifies extraction and source preservation. This suite verifies what happens after preparation: ranking, portable disk search, evidence expansion and lexical grounding under realistic distractor pressure.

Run it independently:

```bash
npm run test:corpus-answer-acceptance
```

It also runs inside `npm test` and the complete `npm run check` gate.

## Corpus shape

`tests/fixtures/corpus-answer-pack.mjs` creates one valid schema-v1 package with 5,202 searchable sections:

- two relevant editions of one source;
- 5,200 deterministic distractors;
- one shared concept with a short alias;
- exact source claims and quotes;
- one confirmed reviewed discrepancy.

The relevant editions both describe the adult daily dose of `Препарат Альфа` but give different values:

- 120 mg in the 2024 edition;
- 100 mg in the 2026 edition.

Distractors include:

- similarly worded dosing records for `Препарат Бета-*`;
- many records mentioning `Препарат Альфа` only in storage context;
- adult daily-activity records without medication dosing.

The corpus is synthetic so it is redistributable and deterministic, but it is deliberately not a tiny demo corpus.

## Memory retrieval

The suite uses the real installed MiniSearch implementation and the production `createSearchEngine` configuration.

It requires:

- both Alpha dose editions to rank before every distractor for the exact query;
- normalized relevance to remain in the public result contract;
- a query containing spelling errors to retain at least one relevant edition in the first results.

## Portable FTS retrieval

The same package is compiled into the production portable SQLite/FTS5 artifact.

The suite verifies:

- all 5,202 records are present;
- the database passes the ordinary artifact builder checks;
- a new read-only SQLite connection ranks the two relevant editions first;
- closing and independently reopening the database returns the same result order;
- the updated pack retains a valid search-artifact manifest.

## Reviewed discrepancy expansion

Evidence collection starts with `sourceLimit: 1`. The production discrepancy expansion must still add the reviewed counterpart as an ordinary supplemental source.

Both source versions must therefore receive ordinary citation IDs and the evidence envelope must contain one confirmed `contradicts` discrepancy. The prompt must present both versions neutrally and must not select the newer source automatically.

## Grounding checks

The accepted answer test cites both reviewed dose values and must pass lexical support verification.

The rejection cases require:

- an invented 150 mg dose to fail because the cited source contains no such number;
- removal of `не` from the mild-renal statement to fail even though the same source section also contains a positive contraindication for severe disease.

## Sentence-local negation

The corpus exposed a verifier defect: negation was previously checked across the complete cited section. A positive sentence about severe disease could therefore mask a negative sentence about mild disease.

The verifier now:

1. splits each cited source into sentence-level evidence fragments;
2. calculates term and number overlap per fragment;
3. selects the most closely matching fragment;
4. compares negation symmetrically within that fragment;
5. exposes the selected fragment in diagnostics.

This remains a deterministic lexical verifier. It does not replace semantic entailment, but it prevents unrelated nearby clauses from satisfying or reversing a scoped statement.

## Maintenance rule

Do not reduce the distractor count or weaken top-result assertions merely to accommodate a ranking regression. A ranking or grounding failure should be treated as a product issue unless the corpus itself is factually malformed.
