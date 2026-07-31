const packCreatorPage = createPackCreatorPage({
  form: document.querySelector('#pack-creator-form'),
  titleInput: document.querySelector('#pack-creator-title'),
  idInput: document.querySelector('#pack-creator-id'),
  versionInput: document.querySelector('#pack-creator-version'),
  descriptionInput: document.querySelector('#pack-creator-description'),
  languageInput: document.querySelector('#pack-creator-language'),
  filesInput: document.querySelector('#pack-creator-files'),
  manualTextInput: document.querySelector('#pack-creator-text'),
  fileSummary: document.querySelector('#pack-creator-file-summary'),
  status: document.querySelector('#pack-creator-status'),
  preview: document.querySelector('#pack-creator-preview'),
  resultActions: document.querySelector('#pack-creator-result-actions'),
  buildButton: document.querySelector('#pack-creator-build'),
  resetButton: document.querySelector('#pack-creator-reset'),
  downloadButton: document.querySelector('#pack-creator-download'),
  installButton: document.querySelector('#pack-creator-install'),
  backButtons: document.querySelectorAll('[data-action="back-to-library"]'),
  onBack: () => routeTo('library'),
  onDownload(pack) {
    downloadJson(safePackFilename(pack), pack);
  },
  async onInstall(pack) {
    await installPack(pack, { sizeBytes: packByteSize(pack) });
    toast(`Пакет «${pack.title}» установлен и доступен офлайн.`);
  },
  onError: (message) => toast(message, 'error'),
});

for (const button of document.querySelectorAll('[data-action="create-pack"]')) {
  button.addEventListener('click', () => routeTo('create-pack'));
}

const showBasePageWithoutPackCreatorNav = showBasePage;
showBasePage = function showBasePageWithPackCreatorNav(page, options = {}) {
  showBasePageWithoutPackCreatorNav(page, options);
  if (normalizeBaseRoute(page) !== 'create-pack') return;
  for (const button of dom.navButtons) button.classList.toggle('active', button.dataset.nav === 'library');
};

Object.assign(state, { packCreatorPage });
