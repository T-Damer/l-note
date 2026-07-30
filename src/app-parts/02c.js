        openNoteDialog(note);
      });
      list.append(button);
    }
    dom.entityDialogBody.append(list);
  }
  if (dom.documentDialog.open) dom.documentDialog.close();
  if (!dom.entityDialog.open) dom.entityDialog.showModal();
}

async function renderCatalog() {
  const installedById = new Map(state.packRecords.map((record) => [record.id, record]));
  const entries = [...state.catalog.packs];
  for (const record of state.packRecords) {
