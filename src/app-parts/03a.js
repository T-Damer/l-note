    if (!entries.some((entry) => entry.id === record.id)) {
      entries.push({
        id: record.id,
        version: record.pack.version,
        title: record.pack.title,
        description: record.pack.description,
        language: record.pack.language,
        stats: {
          documents: record.pack.documents.length,
          entities: record.pack.entities.length,
          claims: record.pack.claims.length,
        },
        localOnly: true,
      });
    }
  }
  dom.catalogGrid.replaceChildren();
  for (const entry of entries) {
    const installed = installedById.get(entry.id);
    const updateAvailable = Boolean(
      installed && entry.url && (entry.version !== installed.pack.version || (entry.sha256 && entry.sha256 !== installed.sha256)),
    );
    const stats = entry.stats ?? {};
    const openPackage = () => navigateResource('package', entry.id);
    const card = Card({
      kind: 'package',
      className: `pack-card${installed ? ' installed' : ''}`,
      interactive: true,
      ariaLabel: `Открыть пакет ${entry.title}`,
      onActivate: openPackage,
    });
    const header = create('header');
    header.append(
      create('div', {}, [
        Text({
          variant: 'eyebrow',
          text: updateAvailable ? 'Доступно обновление' : installed ? (installed.enabled ? 'Установлен' : 'Отключён') : entry.kind ?? 'Пакет',
        }),
        Text({ variant: 'title', as: 'h2', text: entry.title }),
      ]),
      create('span', { className: 'pill blue', text: entry.language ?? 'ru' }),
    );
    card.append(header, Text({ variant: 'muted', text: entry.description ?? '' }));
    const meta = create('div', { className: 'pack-meta' });
    meta.append(
      create('span', { className: 'pill muted', text: `${stats.documents ?? installed?.pack.documents.length ?? 0} документов` }),
      create('span', { className: 'pill muted', text: `${stats.entities ?? installed?.pack.entities.length ?? 0} понятий` }),
      create('span', { className: 'pill muted', text: `${stats.claims ?? installed?.pack.claims.length ?? 0} утверждений` }),
    );
    card.append(meta);
    const footer = create('footer');
    footer.append(
      Text({
        variant: 'caption',
        text: installed && updateAvailable
          ? `установлен ${installed.pack.version} · доступен ${entry.version} · ${formatBytes(entry.bytes)}`
          : `${installed?.pack.version ?? entry.version ?? '—'} · ${formatBytes(installed?.sizeBytes ?? entry.bytes)}`,
      }),
    );
    const actions = create('div', { className: 'header-actions' });
    if (!installed) {
      const install = Button({
        variant: 'primary',
        icon: 'download',
        text: 'Скачать',
        disabled: !entry.url,
        onClick(event) {
          event.stopPropagation();
          downloadAndInstall(entry, install);
        },
      });
      actions.append(install);
    } else {
      if (updateAvailable) {
        const update = Button({
          variant: 'primary',
          icon: 'download',
          text: 'Обновить',
          onClick(event) {
            event.stopPropagation();
            downloadAndInstall(entry, update);
          },
        });
        actions.append(update);
      }
      const toggle = Button({
        variant: 'secondary',
        text: installed.enabled ? 'Отключить' : 'Включить',
        async onClick(event) {
          event.stopPropagation();
          await storagePort.putOne('packs', { ...installed, enabled: !installed.enabled });
          await refreshState();
        },
      });
      const remove = Button({
        variant: 'danger',
        text: 'Удалить',
        async onClick(event) {
          event.stopPropagation();
          if (!confirm(`Удалить пакет «${installed.pack.title}»? Личные заметки останутся.`)) return;
          await storagePort.deleteOne('packs', installed.id);
          await refreshState();
        },
      });
      actions.append(toggle, remove);
    }
    footer.append(actions);
    card.append(footer);
    dom.catalogGrid.append(card);
  }
}

async function renderStorageSummary() {
  const installedBytes = state.packRecords.reduce((sum, record) => sum + Number(record.sizeBytes ?? 0), 0);
  let usage = null;
  let quota = null;
  try {
    const estimate = await navigator.storage?.estimate?.();
    usage = estimate?.usage ?? null;
    quota = estimate?.quota ?? null;
  } catch {
    // Optional API.
  }
  dom.storageSummary.replaceChildren(
    create('span', { text: `Пакеты: ${state.packRecords.length}` }),
    create('span', { text: `Данные пакетов: ${formatBytes(installedBytes)}` }),
    create('span', { text: usage !== null ? `Хранилище сайта: ${formatBytes(usage)} / ${formatBytes(quota)}` : 'Хранилище: IndexedDB' }),
  );
}

function detectRelatedEntities(text) {
  return detectEntitiesInText({
    entities: state.knowledge.entities.values(),
    text,
    normalizeText,
    limit: 16,
  });
}
