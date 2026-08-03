export function incompletePreparationReviews(manifest) {
  const reviews = manifest?.preparationReviews;
  if (reviews === undefined) return [];
  if (!Array.isArray(reviews)) throw new Error('manifest.preparationReviews must be an array.');
  return reviews.filter((review) => review?.status !== 'completed');
}

export function assertPreparationReviewsComplete(manifest) {
  const incomplete = incompletePreparationReviews(manifest);
  if (!incomplete.length) return;
  const labels = incomplete.map((review) => {
    const kind = review?.kind ?? review?.reviewKind ?? 'unknown';
    const pending = Number(review?.pending ?? 0);
    return `${kind}${pending ? ` (${pending} pending)` : ''}`;
  });
  throw new Error([
    'Preparation review is incomplete.',
    `Resolve or dismiss every candidate before building the pack: ${labels.join(', ')}.`,
  ].join(' '));
}
