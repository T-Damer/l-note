const routedResourceRenderer = createRoutedResourceRenderer({
  renderers: {
    document(route) {
      return renderDocumentResource({
        record: { documentId: route.resourceId, sectionId: route.sectionId },
        knowledge: state.knowledge,
        dialogView: documentDialogView,
        navigate: navigateResource,
        findDocumentForSection,
        normalizeText,
      });
    },
    concept(route) {
      return renderConceptResource({
        entityId: route.resourceId,
        knowledge: state.knowledge,
        notes: state.notes,
        dialogView: entityDialogView,
        navigate: navigateResource,
        predicateLabel: relationPredicateLabel,
        strengthLabel: relationStrengthLabel,
        relationLabel,
      });
    },
    statement(route) {
      return renderStatementResource({
        claimId: route.resourceId,
        knowledge: state.knowledge,
        dialogView: entityDialogView,
        navigate: navigateResource,
        predicateLabel: relationPredicateLabel,
        relationLabel,
      });
    },
    package: (route) => renderPackageDialog(route.resourceId),
    note: (route) => renderNoteRoute(route),
  },
  onMissing(route) {
    toast('Запрошенная карточка недоступна в активных пакетах.', 'error');
    closeResourceChain(route.base);
  },
});

renderResourceRoute = function renderResourceThroughRegistry(route) {
  return routedResourceRenderer.render(route);
};

Object.assign(state, { routedResourceRenderer });
