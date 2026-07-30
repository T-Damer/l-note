import { closeRoutedDialogs, createRoutedDialogController } from './ui/routed-dialog.js';

const documentDialogView = createRoutedDialogController({
  dialog: dom.documentDialog,
  heading: dom.documentDialogHeading,
  body: dom.documentDialogBody,
});
const entityDialogView = createRoutedDialogController({
  dialog: dom.entityDialog,
  heading: dom.entityDialogHeading,
  body: dom.entityDialogBody,
});
const noteDialogView = createRoutedDialogController({
  dialog: dom.noteDialog,
  heading: dom.noteDialog.querySelector('.dialog-heading'),
  body: dom.noteDialog.querySelector('.dialog-body'),
});

const routedDialogViews = Object.freeze([
  documentDialogView,
  entityDialogView,
  noteDialogView,
]);
const routedDialogByElement = new Map(routedDialogViews.map((controller) => [controller.dialog, controller]));

Object.assign(dom, {
  documentDialogView,
  entityDialogView,
  noteDialogView,
  routedDialogViews,
});

closeAllDialogs = function closeAllRoutedDialogs() {
  closeRoutedDialogs(routedDialogViews);
};

showRoutedDialog = function showControlledRoutedDialog(dialog) {
  const controller = routedDialogByElement.get(dialog);
  if (!controller) throw new Error('Unknown routed dialog.');
  controller.show();
};

updateResourceNavigation = function updateControlledResourceNavigation(route) {
  const canGoBack = route.kind === 'resource' && route.depth > 1;
  for (const controller of routedDialogViews) controller.setBackAvailable(canGoBack);
};
