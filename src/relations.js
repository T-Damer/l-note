const RELATION_LABELS = Object.freeze({
  'may present with': 'может проявляться',
  may_present_with: 'может проявляться',
  related_to: 'связано с',
  associated_with: 'ассоциировано с',
  diagnosed_by: 'диагностируется с помощью',
  differential_for: 'учитывается в дифференциальной диагностике',
  treated_with: 'лечится с помощью',
  routine_therapy: 'обычная терапия',
  contraindicated_with: 'противопоказано вместе с',
  requires_assessment_of: 'требует оценки',
  abbreviation_of: 'расшифровывается как',
  expands_to: 'расшифровывается как',
  mentioned_in: 'упоминается в',
  supports: 'поддерживает',
  refines: 'уточняет',
  contradicts: 'противоречит',
  supersedes: 'локально заменяет',
});

export function relationPredicateLabel(predicate) {
  const source = String(predicate ?? 'related_to').trim();
  const normalized = source.toLocaleLowerCase('ru-RU').replace(/[-\s]+/gu, '_');
  return RELATION_LABELS[source.toLocaleLowerCase('ru-RU')]
    ?? RELATION_LABELS[normalized]
    ?? source.replaceAll('_', ' ');
}

export function relationStrength(relation) {
  const raw = relation?.weight ?? relation?.strength ?? relation?.confidence;
  if (!Number.isFinite(Number(raw))) return null;
  const numeric = Number(raw);
  const normalized = numeric <= 1 ? numeric : numeric / 100;
  const percent = Math.max(0, Math.min(100, Math.round(normalized * 100)));
  const category = percent >= 67 ? 'сильная' : percent >= 34 ? 'средняя' : 'слабая';
  return { percent, category };
}

export function relationStrengthLabel(relation) {
  const strength = relationStrength(relation);
  return strength ? `${strength.percent}% · ${strength.category}` : 'сила не указана';
}

export const relationLabels = RELATION_LABELS;
