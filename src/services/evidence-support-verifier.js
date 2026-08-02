import { normalizeText, tokenize } from '../search.js';
import { defineEvidenceVerifierPort } from '../core/ports.js';

const STOP_WORDS = new Set([
  'а', 'без', 'более', 'бы', 'был', 'была', 'были', 'было', 'в', 'во', 'для', 'до', 'его', 'ее', 'её',
  'и', 'из', 'или', 'их', 'к', 'как', 'ко', 'ли', 'на', 'не', 'но', 'о', 'об', 'от', 'по', 'при', 'с', 'со',
  'так', 'также', 'то', 'у', 'что', 'это', 'этот', 'эта', 'эти', 'the', 'a', 'an', 'and', 'or', 'of', 'to',
  'in', 'on', 'for', 'with', 'without', 'is', 'are', 'was', 'were', 'be', 'this', 'that', 'these', 'those',
]);

const NEGATION_PATTERNS = Object.freeze([
  /(?:^|[^\p{L}\p{N}])не(?:$|[^\p{L}\p{N}])/iu,
  /(?:^|[^\p{L}\p{N}])нет(?:$|[^\p{L}\p{N}])/iu,
  /(?:^|[^\p{L}\p{N}])без(?:$|[^\p{L}\p{N}])/iu,
  /отсутств/iu,
  /не\s+выяв/iu,
  /не\s+обнаруж/iu,
  /(?:^|[^\p{L}\p{N}])not(?:$|[^\p{L}\p{N}])/iu,
  /(?:^|[^\p{L}\p{N}])no(?:$|[^\p{L}\p{N}])/iu,
  /(?:^|[^\p{L}\p{N}])without(?:$|[^\p{L}\p{N}])/iu,
  /absent/iu,
]);

const META_PATTERNS = Object.freeze([
  /данных недостаточно/iu,
  /источник(?:и|ах)? не (?:содерж|позвол)/iu,
  /нельзя сделать (?:надёжный )?вывод/iu,
  /по предоставленным источникам/iu,
  /insufficient (?:data|evidence)/iu,
  /sources? (?:do|does) not/iu,
]);

function answerText(answer) {
  return typeof answer === 'string' ? answer : String(answer?.text ?? '');
}

function citationIds(text) {
  return [...String(text).matchAll(/\[S(\d+)\]/gu)].map((match) => `S${match[1]}`);
}

function stripMarkup(text) {
  return String(text)
    .replace(/\[S\d+\]/gu, ' ')
    .replace(/^\s*(?:#{1,6}|[-*+] |\d+[.)]\s*)/gu, '')
    .replace(/[*_`>]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function splitAnswerStatements(text) {
  const statements = [];
  for (const line of String(text ?? '').split(/\n+/gu)) {
    const cleanLine = line.trim();
    if (!cleanLine) continue;
    const parts = cleanLine.split(/(?<=[.!?])\s+(?=[\p{Lu}\p{N}])/gu);
    for (const part of parts) {
      const clean = part.trim();
      if (clean) statements.push(clean);
    }
  }
  return statements;
}

function sourceText(source) {
  return [
    source?.result?.title,
    source?.result?.body,
    source?.result?.snippet,
    source?.document?.title,
    source?.document?.summary,
    source?.section?.title,
    source?.section?.text,
    ...(source?.claims ?? []).flatMap((claim) => [claim?.text, claim?.source?.quote]),
  ].filter(Boolean).join(' ');
}

function sourceMap(evidence) {
  return new Map((evidence?.sources ?? []).map((source) => [source.id, {
    source,
    text: sourceText(source),
  }]));
}

function contentTerms(text) {
  return [...new Set(tokenize(stripMarkup(text)).filter((token) => (
    token.length >= 3 && !STOP_WORDS.has(token) && !/^\d+(?:[.,]\d+)?$/u.test(token)
  )))];
}

function numbers(text) {
  return [...new Set(
    stripMarkup(text)
      .match(/\b\d+(?:[.,]\d+)?(?:\s*%|\s*(?:мг|мл|г|кг|см|мм|дн|дней|час|ч|лет|месяц\w*))?/giu)
      ?.map((value) => normalizeText(value).replace(',', '.'))
      ?? [],
  )];
}

function hasNegation(text) {
  return NEGATION_PATTERNS.some((pattern) => pattern.test(text));
}

function sharedStem(left, right) {
  const minimum = Math.min(left.length, right.length);
  if (minimum < 5) return false;
  const required = Math.max(4, minimum - 2);
  return left.slice(0, required) === right.slice(0, required);
}

function termSupported(term, sourceTokens) {
  return sourceTokens.some((candidate) => candidate === term || sharedStem(term, candidate));
}

function coverageFor(statement, evidenceText) {
  const terms = contentTerms(statement);
  const sourceTokens = [...new Set(tokenize(evidenceText))];
  const matched = terms.filter((term) => termSupported(term, sourceTokens));
  return {
    terms,
    matched,
    coverage: terms.length ? matched.length / terms.length : 0,
  };
}

function statementThreshold(termCount) {
  if (termCount <= 2) return .5;
  if (termCount <= 5) return .6;
  return .55;
}

function evidenceSupportsStatement(statement, evidenceText) {
  const coverage = coverageFor(statement, evidenceText);
  const requiredNumbers = numbers(statement);
  const evidenceNumbers = new Set(numbers(evidenceText));
  const missingNumbers = requiredNumbers.filter((value) => !evidenceNumbers.has(value));
  const negationMismatch = hasNegation(statement) && !hasNegation(evidenceText);
  const supported = coverage.terms.length > 0
    && coverage.coverage >= statementThreshold(coverage.terms.length)
    && missingNumbers.length === 0
    && !negationMismatch;
  return { ...coverage, missingNumbers, negationMismatch, supported };
}

function isMetaStatement(statement) {
  const clean = stripMarkup(statement);
  if (!clean || /^.{1,80}:$/u.test(clean)) return true;
  return META_PATTERNS.some((pattern) => pattern.test(clean));
}

export function verifyStatementSupport(answer, evidence) {
  const sources = sourceMap(evidence);
  const checks = [];
  const invalidCitations = new Set();
  const unsupportedStatements = [];

  for (const statement of splitAnswerStatements(answerText(answer))) {
    if (isMetaStatement(statement)) continue;
    const citations = [...new Set(citationIds(statement))];
    if (!citations.length) {
      unsupportedStatements.push(statement);
      checks.push({ statement, citations, supported: false, reason: 'missing-citation' });
      continue;
    }
    const candidates = [];
    for (const citation of citations) {
      const source = sources.get(citation);
      if (!source) {
        invalidCitations.add(citation);
        continue;
      }
      candidates.push({ citation, ...evidenceSupportsStatement(statement, source.text) });
    }
    const best = candidates.sort((left, right) => right.coverage - left.coverage)[0] ?? null;
    const supported = Boolean(best?.supported);
    if (!supported) unsupportedStatements.push(statement);
    checks.push({
      statement,
      citations,
      supported,
      bestCitation: best?.citation ?? null,
      coverage: best?.coverage ?? 0,
      missingNumbers: best?.missingNumbers ?? numbers(statement),
      negationMismatch: best?.negationMismatch ?? false,
      reason: supported ? 'supported' : 'insufficient-overlap',
    });
  }

  const supportedCount = checks.filter((check) => check.supported).length;
  const invalid = [...invalidCitations];
  const supported = checks.length > 0
    && supportedCount === checks.length
    && invalid.length === 0;
  return {
    accepted: supported,
    supported,
    invalidCitations: invalid,
    unsupportedStatements,
    diagnostics: {
      statementCount: checks.length,
      supportedCount,
      checks,
      verifier: 'lnote.lexical-evidence-support.v1',
    },
  };
}

export function createLexicalEvidenceVerifier() {
  return defineEvidenceVerifierPort({
    id: 'lnote.lexical-evidence-support.v1',
    verify: verifyStatementSupport,
  });
}
