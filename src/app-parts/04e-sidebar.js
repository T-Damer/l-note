const sidebarController = createSidebarController({
  sidebar: document.querySelector('.sidebar'),
  workspace: document.querySelector('.workspace'),
  navButtons: dom.navButtons.filter((button) => button.closest('.sidebar')),
  storagePort,
});

void sidebarController.restore().catch((error) => {
  console.warn('Sidebar preference could not be restored.', error);
});

Object.assign(dom, { sidebarController });
