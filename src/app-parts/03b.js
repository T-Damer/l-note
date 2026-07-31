function downloadJson(filename, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = create('a', { href: url, download: filename });
  anchor.click();
  URL.revokeObjectURL(url);
}

function renderEvidence(evidence) {
  return renderEvidenceView({
    evidence,
    output: dom.answerOutput,
    relationLabel,
    onOpenSource(source) {
      navigateResource('document', source.result.documentId, {
        sectionId: source.result.sectionId,
      });
    },
  });
}
