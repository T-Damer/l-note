        : 'В активных пакетах не найдено достаточных справочных фрагментов.',
    }),
  );
  if (evidence.conflicts.length) {
    const conflict = create('div', { className: 'conflict-box' });
    conflict.append(create('strong', { text: 'Обнаружены локальные противоречия' }));
    for (const item of evidence.conflicts) {
      conflict.append(create('p', { text: `${item.note.title}${item.claim ? ` ↔ ${item.claim.text}` : ''}` }));
    }
    overview.append(conflict);
  }
  dom.answerOutput.append(overview);

  const sourcePanel = create('article', { className: 'answer-panel' });
