# Chronology-aware discrepancy review

## Boundary

Chronology is review evidence, not an authority rule.

L-Note first detects a content-level difference such as a changed quantity, negation, linked value, population or age scope. Only after that gate passes does it add dates, validity intervals, edition information and explicit document relations to the candidate.

Therefore:

- chronology alone never creates a discrepancy candidate;
- a later publication date never raises confidence;
- a later publication date never implies that a source is true, preferred or current;
- `supersedes` is suggested only when the source explicitly declares that it replaces the compared document;
- every final relation still requires a reviewer to accept, edit or dismiss it.

## Time dimensions

The review keeps separate fields for:

- `source.publishedAt` — issue/publication date;
- `source.modifiedAt` — file or source modification time;
- `source.retrievedAt` / `source.preparedAt` — retrieval or preparation time;
- `document.effectiveFrom` — first applicable date;
- `document.effectiveUntil` — first date outside the applicability interval.

`pack.publishedAt` remains the package release timestamp and is not treated as a source edition date.

Supported deterministic temporal values are:

```text
YYYY
YYYY-MM
YYYY-MM-DD
ISO date-time with Z or an explicit UTC offset
```

Partial dates retain their precision. For example, `2025-06` is not converted to `2025-06-01`. Two partial values are ordered only when every date they can represent has the same order; otherwise the relation is `unknown`.

## Validity intervals

A deterministic interval comparison requires both `effectiveFrom` and `effectiveUntil` on each side. A missing end date is not assumed to mean an indefinitely active source.

The review can report:

```text
equal
before / after
meets / met_by
contains / during
overlaps
unknown
```

Clearly non-overlapping validity intervals may change the initial suggestion to `different_scope`, but the reviewer remains responsible for the decision.

## Edition metadata

A document may carry additive edition metadata:

```json
{
  "edition": {
    "seriesId": "guideline.example",
    "identifier": "2.1.0",
    "comparisonAlgorithm": "semver",
    "status": "active",
    "predecessor": "old-pack::old-document",
    "relationToPredecessor": "replaces"
  }
}
```

Supported comparison algorithms are:

```text
semver
integer
date
lexical
manual
```

Identifiers are compared only when both documents declare the same algorithm. `manual` is never automatically ordered.

The deterministic review recognizes explicit relations:

```text
replaces / replaced_by
amends / amended_by
corrects / corrected_by
retracts / retracted_by
```

Only an explicit source-to-target `replaces` relation suggests `supersedes`. An explicit `amends` relation may suggest `refines`. Corrections and retractions are displayed prominently but do not bypass manual review.

## Review artifact

A candidate contains a separate chronology block:

```json
{
  "signals": [
    "numeric_difference",
    "same_edition_series",
    "later_issue_date",
    "later_edition",
    "explicit_replacement"
  ],
  "chronology": {
    "issueOrder": "source_after_target",
    "validityRelation": "after",
    "sameSeries": true,
    "versionOrder": "source_after_target",
    "explicitArtifactRelation": "replaces",
    "source": {},
    "target": {}
  }
}
```

The offline HTML page displays issue, modification, retrieval, applicability and edition information separately and includes a warning that newer does not automatically mean more authoritative.

When the reviewer accepts a candidate, the relation preserves the evidence:

```json
{
  "reviewEvidence": {
    "signals": ["numeric_difference", "later_issue_date"],
    "chronology": {}
  }
}
```

This evidence explains the preparation-time suggestion. It does not become an independent citable source; citations still resolve to the underlying source sections.

## Remaining phase

Chronology enrichment does not yet designate a preferred/current statement. That will be a separate reviewed cross-pack overlay so that:

- historical statements remain visible and citable;
- several current statements can coexist when sources disagree;
- preference can be scoped by date, jurisdiction, population or purpose;
- no new package mutates an older source package.

See `TEMPORAL_PROVENANCE_RESEARCH.md` for the broader standards and external-system analysis.
