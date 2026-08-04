# Temporal provenance and chronology research

Research date: 2026-08-03.

## Decision

L-Note should model chronology as **review evidence**, not as an automatic truth-selection rule.

The immediate implementation should enrich discrepancy-review candidates with distinct publication, validity, edition and review-time signals. It should not change a candidate to `supersedes`, hide an older statement, or select a preferred statement from dates alone.

The portable browser runtime should remain simple. Temporal parsing, edition comparison and preference decisions belong to deterministic preparation plus explicit review. Server products such as Graphiti, XTDB, TerminusDB or Wikibase may be optional adapters or collaborative preparation backends, but none should become a required browser dependency.

## Why the existing single date is insufficient

The current discrepancy detector resolves one display date in this order:

1. `document.effectiveFrom`;
2. `document.source.publishedAt`;
3. `document.source.date`;
4. `pack.publishedAt`.

This is useful for display but merges several different questions:

- When was the source formally issued?
- When was the source file changed?
- During which period did the statement apply?
- When did L-Note ingest or review it?
- Is this document an edition of the same work as another document?
- Did the publisher explicitly replace, amend, withdraw or retract an earlier edition?

A later publication date does not prove later applicability. A newer file modification does not prove a substantive edition. A historical statement can remain correct for its original period. A newer document may apply to another jurisdiction or population. Therefore chronology should be structured before it influences discrepancy review.

## Findings from standards and mature systems

### 1. Separate validity time from record/provenance time

Bitemporal systems distinguish:

- **valid time** — when a fact is considered applicable in the represented world;
- **system or transaction time** — when the system learned, stored or changed the record.

XTDB exposes these as valid time and system time. Graphiti similarly separates fact validity from ingestion/episode provenance. FHIR Provenance distinguishes when an activity occurred from when it was recorded.

L-Note does not need a bitemporal database in the browser, but it should preserve the distinction in metadata and review artifacts.

### 2. Publication, modification and validity are different lifecycle events

Dublin Core defines separate terms for:

- `issued` — formal issuance;
- `modified` — when the resource changed;
- `valid` — a date or range of validity;
- `isVersionOf`, `replaces` and `isReplacedBy` — explicit resource relationships.

These concepts can be used in JSON without adopting RDF. L-Note should reuse their semantics rather than inventing one overloaded `date` field.

### 3. Version identifiers are not universally sortable

FHIR distinguishes:

- record version — technical storage history;
- business version — author/publisher edition;
- specification version — representation format.

FHIR explicitly warns that resource version IDs are not inherently ordered. Canonical resources may declare a version-comparison algorithm because there is no universal way to determine the newest version across semver, dates, integers and publisher-specific labels.

Therefore L-Note must not compare edition strings lexicographically unless an algorithm is declared.

### 4. Historical correctness is different from deprecation

Wikibase separates statement qualifiers, references and ranks:

- `preferred` — default/current or best-supported values;
- `normal` — still relevant, including correct historical values;
- `deprecated` — known unreliable, erroneous or obsolete knowledge.

Wikidata guidance specifically says that correct previous values should use start/end qualifiers rather than deprecated rank. It also allows several preferred statements when current sources disagree.

This is a good model for the later L-Note “preferred/current statement” feature: preference should be a separate reviewed layer, not an implicit consequence of `supersedes` or publication date.

### 5. Replacement and amendment should be explicit

FHIR related-artifact types distinguish:

- `replaces` / `replaced-with` — whole-artifact replacement;
- `amends` / `amended-with` — partial functional replacement;
- `corrects` / `correction-in`;
- `retracts` / `retracted-by`.

This distinction is more precise than treating every later edition as `supersedes`. L-Note currently has statement-level `supersedes`; a future edition layer should preserve whether the source explicitly replaces, amends, corrects, withdraws or merely follows another artifact.

### 6. Provenance entities and source editions should remain immutable

W3C PROV models entities, activities and derivation. `specializationOf` can relate a concrete edition or state to a more general work, while generation and invalidation times describe the lifetime of that entity. This aligns with L-Note’s immutable packs and exact source quotes: a new edition should be another source entity linked to the series, not an in-place rewrite of the old source.

### 7. Full temporal ontologies are unnecessary in the client

OWL-Time supports instants, intervals, ordering and interval relations. Its vocabulary is useful for naming relations such as before, after, overlaps, contains and during. Shipping RDF/OWL reasoning in the browser is not justified for L-Note. A small deterministic interval normalizer is sufficient.

## Ready solutions and where they fit

### Graphiti

Useful capabilities:

- temporal facts with `valid_at` / `invalid_at`;
- raw episodes as provenance;
- incremental updates;
- historical queries;
- hybrid semantic, keyword and graph retrieval.

Fit for L-Note:

- optional server/preparation adapter;
- proposal generation for validity windows and possible replacement relations;
- evaluation reference for temporal retrieval.

Mismatch:

- it normally invalidates an older fact when a newer fact supersedes it;
- timestamps may be LLM-extracted;
- it requires a service, model and graph backend;
- automatic invalidation is unsafe when several jurisdictions, editions or authorities coexist.

Conclusion: reuse as an optional proposal engine, never as the authority that resolves an L-Note discrepancy.

### XTDB

Useful capabilities:

- native valid-time and system-time history;
- point-in-time and interval queries;
- retroactive corrections without losing transaction history.

Fit for L-Note:

- optional server edition for frequently changing organizational data;
- test oracle for chronology logic;
- staging backend when historical queries become a product requirement.

Mismatch:

- substantial infrastructure for a static/offline application;
- does not solve source extraction, exact-quote review or authority policy.

Conclusion: do not add now; keep the pack fields compatible with a future bitemporal adapter.

### TerminusDB

Useful capabilities:

- immutable commits for structured JSON/graph data;
- branch, diff, merge and time-travel;
- field/triple-level review of changes.

Fit for L-Note:

- collaborative strong-device preparation;
- branching proposed pack updates and reviewing structured diffs;
- audit history for teams maintaining large knowledge bases.

Mismatch:

- server/database deployment;
- version-control history is not the same as real-world validity time;
- still needs L-Note-specific source and review contracts.

Conclusion: potentially useful for a team preparation service, not for the browser runtime.

### Wikibase

Useful capabilities:

- statements with qualifiers and multiple references;
- preferred/normal/deprecated ranks;
- several simultaneously preferred values;
- mature collaborative editing.

Fit for L-Note:

- conceptual model for later statement preference/ranking;
- possible enterprise adapter when a team already uses Wikibase.

Mismatch:

- large operational and UI surface;
- entity/property-centric model is heavier than L-Note packs;
- direct adoption would duplicate the portable pack and offline search layer.

Conclusion: adopt the rank/qualifier ideas, not Wikibase as a core dependency.

## Recommended L-Note metadata model

### Document/source chronology

Keep existing fields and add only explicit optional metadata:

```json
{
  "effectiveFrom": "2025-01-01",
  "effectiveUntil": "2026-01-01",
  "source": {
    "publishedAt": "2024-12-15",
    "modifiedAt": "2025-02-03T10:30:00Z",
    "retrievedAt": "2026-08-03T18:00:00Z"
  },
  "edition": {
    "seriesId": "who-guideline.example",
    "identifier": "2025.1",
    "comparisonAlgorithm": "semver",
    "status": "active",
    "predecessor": "old-pack::old-document",
    "relationToPredecessor": "replaces"
  }
}
```

Semantics:

- `effectiveFrom` — first known applicability date;
- `effectiveUntil` — first date outside the applicability interval;
- `source.publishedAt` — formal issue/publication date;
- `source.modifiedAt` — source-file or resource modification time;
- `source.retrievedAt` — when the preparation workflow obtained this representation;
- `edition.seriesId` — stable identity of the work across editions;
- `edition.identifier` — publisher/business version;
- `edition.comparisonAlgorithm` — `semver`, `integer`, `date`, `lexical` or `manual`;
- `edition.status` — `draft`, `active`, `retired`, `withdrawn` or `unknown`;
- predecessor/successor relations — explicit publisher or reviewer-confirmed artifact relations.

Rules:

1. `pack.publishedAt` remains the L-Note package release date and is not a source-edition date.
2. Missing end dates do not prove an open-ended active interval.
3. Partial dates such as `2025` or `2025-03` retain their precision and are not silently converted to January 1.
4. Edition strings are compared only when `comparisonAlgorithm` is known.
5. `modifiedAt` never implies a substantive new edition by itself.

### Review candidate chronology

The preparation-only candidate should gain a non-decisive chronology block:

```json
{
  "signals": [
    "numeric_difference",
    "same_edition_series",
    "later_issue_date",
    "validity_intervals_do_not_overlap",
    "explicit_replacement"
  ],
  "chronology": {
    "issueOrder": "source_after_target",
    "validityRelation": "after",
    "sameSeries": true,
    "versionOrder": "source_after_target",
    "explicitArtifactRelation": "replaces",
    "source": {
      "publishedAt": "2025-01-01",
      "validFrom": "2025-02-01",
      "validUntil": null,
      "edition": "2.0",
      "status": "active"
    },
    "target": {
      "publishedAt": "2023-01-01",
      "validFrom": "2023-02-01",
      "validUntil": "2025-02-01",
      "edition": "1.0",
      "status": "retired"
    }
  }
}
```

Suggested behavior:

- chronology alone never creates a discrepancy candidate;
- chronology never changes the source text or claim;
- a later issue date adds a signal but does not raise the confidence that one statement is true;
- non-overlapping validity intervals may support `different_scope` when the statements describe different periods;
- `supersedes` may be suggested only when there is an explicit replacement relation or a reviewer-confirmed edition policy;
- `withdrawn` and `retracted` are displayed prominently but still require source evidence and review;
- unresolved chronology remains `unknown`, not an inferred order.

## Preferred/current statements should be a separate layer

Do not add `preferred` directly to old claims because a new pack cannot safely mutate claims in another installed pack. A future schema should use a reviewed cross-pack overlay, for example:

```json
{
  "statementSelections": [
    {
      "id": "selection.hypertension.first-line",
      "groupKey": "hypertension:first-line:adult:jurisdiction-x",
      "claimRefs": [
        "guideline-2023::claim:first-line",
        "guideline-2025::claim:first-line"
      ],
      "preferredClaimRefs": [
        "guideline-2025::claim:first-line"
      ],
      "validAt": "2026-08-03",
      "reason": "Current national edition for this jurisdiction and population.",
      "reviewedBy": "Reviewer",
      "reviewedAt": "2026-08-03T18:00:00Z"
    }
  ]
}
```

Several preferred claims must be allowed. Historical claims remain visible and citable. A deprecated rank should require an explicit reason such as known error, retraction or invalid method; age alone is insufficient.

This feature should follow chronology enrichment rather than be included in the first implementation slice.

## Deterministic chronology algorithm

### Accepted input

First implementation:

- ISO 8601 full dates and date-times;
- year-month and year precision retained as imprecise values;
- explicit validity start/end fields;
- declared edition comparison algorithms;
- explicit predecessor/replacement metadata.

Do not initially use free-form NLP date extraction. It would add locale ambiguity and hidden inference to a safety-sensitive preparation step.

### Normalization

For each source side, produce:

```text
issued position + precision
modified position + precision
validity start position + precision
validity end position + precision
edition series and identifier
edition comparison policy
explicit artifact relations
status
```

For exact dates, interval comparison may internally use half-open ranges `[from, until)`. Imprecise dates should produce only relations that are certain for every possible date represented by their precision. Otherwise return `unknown`.

### Interval relations

The useful subset is:

- `before` / `after`;
- `overlaps`;
- `contains` / `during`;
- `equal`;
- `meets`;
- `unknown`.

This subset is sufficient for discrepancy review and maps cleanly to OWL-Time/Allen interval terminology without adding an ontology runtime.

### Type suggestion policy

| Content result | Chronology evidence | Suggested review type |
|---|---|---|
| equivalent values | any | no discrepancy candidate |
| incompatible values | overlapping/unknown validity | `contradicts` |
| incompatible values | clearly disjoint validity periods | `different_scope` |
| later edition | later publication only | keep content-derived type; add signal |
| later edition | explicit `replaces` and same series | may suggest `supersedes` |
| partial update | explicit `amends` | normally `refines`; reviewer decides |
| known error/retraction | explicit source relation | preserve relation/status and request review |

## Implementation sequence

### Slice 1 — chronology enrichment without schema-level preference

1. Add a small date/interval normalization module.
2. Read existing dates plus optional `effectiveUntil`, `source.modifiedAt`, `source.retrievedAt` and `edition`.
3. Add chronology and chronology signals to review candidates.
4. Keep existing content detector as the gate that creates a candidate.
5. Update JSON and standalone HTML review UI.
6. Preserve accepted chronology evidence in `statementRelations` review provenance, but not as a truth decision.
7. Add tests for overlap, adjacency, disjoint periods, partial dates, unknown order and explicit replacement.

### Slice 2 — explicit artifact chronology

1. Add reviewed document/edition relations: predecessor, successor, replaces, amends, corrects, retracts.
2. Validate pack-qualified document references.
3. Show edition lineage in the source reader and discrepancy panel.
4. Add import mappings from Dublin Core, FHIR related-artifact metadata and external adapters.

### Slice 3 — preferred/current overlay

1. Introduce reviewed `statementSelections` or an equivalent cross-pack overlay.
2. Permit several preferred claims.
3. Keep historical/normal claims searchable and citable.
4. Require reasons for deprecated selections.
5. Let query-time evidence prefer reviewed selections only for matching scope and time, with an option to include all versions.

### Slice 4 — optional external adapters

- Graphiti: temporal proposal adapter.
- XTDB: bitemporal server storage adapter.
- TerminusDB: collaborative pack/review history adapter.
- Wikibase: import/export of statement qualifiers, references and ranks.

## Rejected shortcuts

- Sort all version strings lexicographically.
- Treat `modifiedAt` as a new edition.
- Infer `supersedes` from publication dates.
- Mark older but historically correct claims deprecated.
- Remove invalidated or superseded source text from packs.
- Use LLM-extracted dates without review.
- Require a graph or temporal database for offline search.
- Store only the currently preferred statement.

## Official references

- W3C PROV-O: https://www.w3.org/TR/prov-o/
- W3C PROV semantics: https://www.w3.org/TR/prov-sem/
- W3C/OGC OWL-Time: https://www.w3.org/TR/owl-time/
- DCMI Metadata Terms: https://www.dublincore.org/specifications/dublin-core/dcmi-terms/
- Wikibase data model: https://www.mediawiki.org/wiki/Wikibase/DataModel
- Wikidata ranks: https://www.wikidata.org/wiki/Help:Ranking
- Wikidata qualifiers: https://www.wikidata.org/wiki/Help:Qualifiers/en
- FHIR Resource versions: https://hl7.org/fhir/resource.html
- FHIR CanonicalResource version comparison: https://fhir.hl7.org/fhir/canonicalresource.html
- FHIR Provenance: https://hl7.org/fhir/provenance.html
- FHIR related-artifact types: https://www.hl7.org/fhir/valueset-related-artifact-type-all.html
- Graphiti: https://github.com/getzep/graphiti
- XTDB time model: https://docs.xtdb.com/about/time-in-xtdb.html
- TerminusDB version control: https://terminusdb.org/docs/knowledge-graph-version-control/
