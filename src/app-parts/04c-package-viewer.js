function renderPackageDialog(packId) {
  const installed = state.packRecords.find((record) => record.id === packId) ?? null;
  const entry = state.catalog.packs.find((item) => item.id === packId) ?? null;
  const pack = installed?.pack ?? null;
  if (!installed && !entry) return false;

  const title = pack?.title ?? entry.title;
  const description = pack?.description ?? entry.description ?? '';
  dom.documentDialogView.replaceHeading([
    create('p', { className: 'eyebrow', text: installed ? (installed.enabled ? 'Установленный пакет' : 'Отключённый пакет') : 'Доступен для загрузки' }),
    create('h2', { text: title }),
    create('p', { text: `${pack?.version ?? entry.version ?? '—'} · ${pack?.language ?? entry.language ?? 'ru'}` }),
  ]);
  dom.documentDialogView.replaceBody();
  if (description) dom.documentDialogView.appendBody(create('p', { className: 'document-summary', text: description }));

  const stats = entry?.stats ?? {};
  const summary = create('div', { className: 'storage-summary' });
  summary.append(
    create('span', { text: `${pack?.documents?.length ?? stats.documents ?? 0} документов` }),
    create('span', { text: `${pack?.entities?.length ?? stats.entities ?? 0} понятий` }),
    create('span', { text: `${pack?.claims?.length ?? stats.claims ?? 0} утверждений` }),
  );
  dom.documentDialogView.appendBody(summary);

  if (!installed) {
    const download = create('button', { className: 'primary-button', type: 'button', text: 'Скачать пакет' });
    download.disabled = !entry?.url;
    download.addEventListener('click', () => downloadAndInstall(entry, download));
    dom.documentDialogView.appendBody(download);
    dom.documentDialogView.show();
    return true;
  }

  if (!installed.enabled) {
    const enable = create('button', { className: 'primary-button', type: 'button', text: 'Включить пакет' });
    enable.addEventListener('click', async () => {
      await storagePort.putOne('packs', { ...installed, enabled: true });
      await refreshState();
    });
    dom.documentDialogView.appendBody(enable);
  }

  if (pack?.documents?.length) {
    dom.documentDialogView.appendBody(create('h3', { text: 'Документы' }));
    const list = create('div', { className: 'backlink-list' });
    for (const documentRecord of pack.documents) {
      const button = create('button', { className: 'backlink-button', type: 'button' }, [
        create('strong', { text: documentRecord.title }),
        create('small', { text: documentRecord.summary ?? `${documentRecord.sections?.length ?? 0} разделов` }),
      ]);
      button.disabled = !installed.enabled;
      button.addEventListener('click', () => navigateResource('document', documentRecord.id, { sectionId: documentRecord.sections?.[0]?.id }));
      list.append(button);
    }
    dom.documentDialogView.appendBody(list);
  }

  if (pack?.entities?.length) {
    const accordion = create('details', { className: 'relation-accordion' });
    accordion.append(create('summary', { text: `Понятия · ${pack.entities.length}` }));
    const list = create('div', { className: 'backlink-list' });
    for (const entity of pack.entities) {
      const button = create('button', { className: 'backlink-button', type: 'button' }, [
        create('strong', { text: entity.name }),
        create('small', { text: entity.description ?? (entity.aliases ?? []).join(', ') }),
      ]);
      button.disabled = !installed.enabled;
      button.addEventListener('click', () => navigateResource('concept', entity.id));
      list.append(button);
    }
    accordion.append(list);
    dom.documentDialogView.appendBody(accordion);
  }

  dom.documentDialogView.show();
  return true;
}
