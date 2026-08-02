import { Button } from '../ui/components.js';
import { element } from '../ui/dom.js';
import { Text } from '../ui/text.js';

function packageState(packRecords, catalog, packId) {
  const installed = packRecords.find((record) => record.id === packId) ?? null;
  const entry = catalog.packs.find((record) => record.id === packId) ?? null;
  return { installed, entry, pack: installed?.pack ?? null };
}

function visibleConflictCount(pack, stats) {
  if (pack?.statementRelations) {
    return pack.statementRelations.filter((relation) => (
      relation.status !== 'dismissed'
      && ['contradicts', 'supersedes', 'different_scope'].includes(relation.type)
    )).length;
  }
  return Number(stats.statementRelations ?? 0);
}

function renderStats(pack, entry) {
  const stats = entry?.stats ?? {};
  const values = [
    element('span', { text: `${pack?.documents?.length ?? stats.documents ?? 0} документов` }),
    element('span', { text: `${pack?.entities?.length ?? stats.entities ?? 0} понятий` }),
    element('span', { text: `${pack?.claims?.length ?? stats.claims ?? 0} утверждений` }),
  ];
  const conflicts = visibleConflictCount(pack, stats);
  if (conflicts) values.push(element('span', { text: `${conflicts} расхождений` }));
  return element('div', { className: 'storage-summary' }, values);
}

function renderInstallAction(entry, onInstall) {
  const button = Button({
    variant: 'primary',
    icon: 'download',
    text: 'Скачать пакет',
    disabled: !entry?.url,
  });
  button.addEventListener('click', () => onInstall?.(entry, button));
  return button;
}

function renderEnableAction(installed, onEnable) {
  if (installed.enabled) return null;
  return Button({
    variant: 'primary',
    text: 'Включить пакет',
    onClick: () => onEnable?.(installed),
  });
}

function renderDocuments(pack, installed, navigate) {
  if (!pack?.documents?.length) return [];
  const list = element('div', { className: 'backlink-list' });
  for (const documentRecord of pack.documents) {
    list.append(Button({
      variant: 'ghost',
      className: 'backlink-button',
      disabled: !installed.enabled,
      children: [
        Text({ variant: 'body', as: 'strong', text: documentRecord.title }),
        Text({
          variant: 'caption',
          as: 'small',
          text: documentRecord.summary ?? `${documentRecord.sections?.length ?? 0} разделов`,
        }),
      ],
      onClick: () => navigate('document', documentRecord.id, {
        sectionId: documentRecord.sections?.[0]?.id,
      }),
    }));
  }
  return [Text({ variant: 'heading', as: 'h3', text: 'Документы' }), list];
}

function renderConcepts(pack, installed, navigate) {
  if (!pack?.entities?.length) return null;
  const list = element('div', { className: 'backlink-list' });
  for (const entity of pack.entities) {
    list.append(Button({
      variant: 'ghost',
      className: 'backlink-button',
      disabled: !installed.enabled,
      children: [
        Text({ variant: 'body', as: 'strong', text: entity.name }),
        Text({
          variant: 'caption',
          as: 'small',
          text: entity.description ?? (entity.aliases ?? []).join(', '),
        }),
      ],
      onClick: () => navigate('concept', entity.id),
    }));
  }
  return element('details', { className: 'relation-accordion' }, [
    element('summary', { text: `Понятия · ${pack.entities.length}` }),
    list,
  ]);
}

export function renderPackageResource({
  packId,
  packRecords,
  catalog,
  dialogView,
  navigate,
  onInstall,
  onEnable,
} = {}) {
  const { installed, entry, pack } = packageState(packRecords, catalog, packId);
  if (!installed && !entry) return false;

  const title = pack?.title ?? entry.title;
  const description = pack?.description ?? entry.description ?? '';
  dialogView.replaceHeading([
    Text({
      variant: 'eyebrow',
      text: installed
        ? installed.enabled ? 'Установленный пакет' : 'Отключённый пакет'
        : 'Доступен для загрузки',
    }),
    Text({ variant: 'title', as: 'h2', text: title }),
    Text({
      variant: 'muted',
      text: `${pack?.version ?? entry.version ?? '—'} · ${pack?.language ?? entry.language ?? 'ru'}`,
    }),
  ]);

  const body = [];
  if (description) body.push(Text({ variant: 'body', className: 'document-summary', text: description }));
  body.push(renderStats(pack, entry));
  if (!installed) {
    body.push(renderInstallAction(entry, onInstall));
  } else {
    body.push(renderEnableAction(installed, onEnable));
    body.push(...renderDocuments(pack, installed, navigate));
    body.push(renderConcepts(pack, installed, navigate));
  }
  dialogView.replaceBody(body.filter(Boolean));
  dialogView.show();
  return true;
}
