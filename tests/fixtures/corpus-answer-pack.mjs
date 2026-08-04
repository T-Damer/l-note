export const ALPHA_QUERY = 'суточная доза препарата Альфа';
export const ALPHA_TYPO_QUERY = 'суточная доза препрата Алфа';
export const ALPHA_2024_DOSE = 'Для взрослых суточная доза препарата Альфа составляет 120 мг.';
export const ALPHA_2026_DOSE = 'Для взрослых суточная доза препарата Альфа составляет 100 мг.';
export const ALPHA_MILD_RENAL = 'Препарат Альфа не противопоказан при лёгкой почечной недостаточности.';
export const ALPHA_SEVERE_RENAL = 'Препарат Альфа противопоказан при тяжёлой почечной недостаточности.';

function source(documentId, sectionId, quote) {
  return { documentId, sectionId, quote };
}

function relevantDocuments() {
  return [
    {
      id: 'alpha.guideline.2024',
      title: 'Препарат Альфа — редакция 2024',
      authority: 'reference',
      effectiveFrom: '2024-01-01',
      source: { title: 'Руководство по препарату Альфа 2024', publishedAt: '2024-01-01' },
      sections: [{
        id: 'adult-dose',
        title: 'Дозирование у взрослых',
        text: `${ALPHA_2024_DOSE}\n\n${ALPHA_MILD_RENAL}`,
        entityIds: ['drug.alpha'],
        tags: ['дозирование', 'взрослые', 'почки'],
      }],
    },
    {
      id: 'alpha.guideline.2026',
      title: 'Препарат Альфа — редакция 2026',
      authority: 'reference',
      effectiveFrom: '2026-01-01',
      source: { title: 'Руководство по препарату Альфа 2026', publishedAt: '2026-01-01' },
      sections: [{
        id: 'adult-dose',
        title: 'Дозирование у взрослых',
        text: `${ALPHA_2026_DOSE}\n\n${ALPHA_SEVERE_RENAL}`,
        entityIds: ['drug.alpha'],
        tags: ['дозирование', 'взрослые', 'почки'],
      }],
    },
  ];
}

function distractorDocument(index) {
  const serial = String(index).padStart(4, '0');
  const variant = index % 3;
  if (variant === 0) {
    return {
      id: `beta.${serial}`,
      title: `Препарат Бета-${serial}: дозирование`,
      authority: 'reference',
      sections: [{
        id: 'dose',
        title: 'Суточная доза',
        text: `Для взрослых суточная доза препарата Бета-${serial} составляет ${80 + (index % 7) * 10} мг.`,
        entityIds: [],
        tags: ['дозирование', 'взрослые'],
      }],
    };
  }
  if (variant === 1) {
    return {
      id: `alpha-storage.${serial}`,
      title: `Препарат Альфа: хранение, запись ${serial}`,
      authority: 'reference',
      sections: [{
        id: 'storage',
        title: 'Условия хранения',
        text: `Препарат Альфа в архивной записи ${serial} хранят в сухом месте. Дозирование в этом разделе не рассматривается.`,
        entityIds: ['drug.alpha'],
        tags: ['хранение'],
      }],
    };
  }
  return {
    id: `adult-activity.${serial}`,
    title: `Активность взрослых — запись ${serial}`,
    authority: 'reference',
    sections: [{
      id: 'activity',
      title: 'Суточная активность',
      text: `Для взрослых в записи ${serial} описана суточная физическая активность без лекарственных препаратов.`,
      entityIds: [],
      tags: ['взрослые', 'активность'],
    }],
  };
}

export function createCorpusAnswerPack({ distractors = 5200 } = {}) {
  const documents = [
    ...relevantDocuments(),
    ...Array.from({ length: distractors }, (_, index) => distractorDocument(index + 1)),
  ];
  return {
    schemaVersion: 1,
    id: 'acceptance.corpus.answers',
    version: '1.0.0',
    title: 'Acceptance corpus for retrieval and answers',
    description: 'Synthetic non-demo corpus with reviewed source discrepancies and ranking distractors.',
    language: 'ru',
    tags: ['acceptance', 'retrieval'],
    documents,
    entities: [{
      id: 'drug.alpha',
      name: 'Препарат Альфа',
      aliases: ['Альфа'],
      type: 'product',
    }],
    claims: [
      {
        id: 'claim.alpha.dose.120',
        text: ALPHA_2024_DOSE,
        subjectId: 'drug.alpha',
        predicate: 'daily-dose',
        source: source('alpha.guideline.2024', 'adult-dose', ALPHA_2024_DOSE),
      },
      {
        id: 'claim.alpha.mild-renal',
        text: ALPHA_MILD_RENAL,
        subjectId: 'drug.alpha',
        predicate: 'renal-contraindication',
        source: source('alpha.guideline.2024', 'adult-dose', ALPHA_MILD_RENAL),
      },
      {
        id: 'claim.alpha.dose.100',
        text: ALPHA_2026_DOSE,
        subjectId: 'drug.alpha',
        predicate: 'daily-dose',
        source: source('alpha.guideline.2026', 'adult-dose', ALPHA_2026_DOSE),
      },
      {
        id: 'claim.alpha.severe-renal',
        text: ALPHA_SEVERE_RENAL,
        subjectId: 'drug.alpha',
        predicate: 'renal-contraindication',
        source: source('alpha.guideline.2026', 'adult-dose', ALPHA_SEVERE_RENAL),
      },
    ],
    relations: [],
    statementRelations: [{
      id: 'review.alpha.daily-dose',
      sourceClaimId: 'claim.alpha.dose.100',
      targetClaimId: 'claim.alpha.dose.120',
      type: 'contradicts',
      status: 'confirmed',
      reason: 'Две проверенные редакции указывают разные суточные дозы для взрослых.',
      detectedBy: 'package-author',
      confidence: 1,
    }],
  };
}
