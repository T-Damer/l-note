import { Switch } from './ui/components.js';

const personalPriorityLabel = dom.personalPriority?.closest('label');
if (personalPriorityLabel) {
  const personalPrioritySwitch = Switch({
    input: dom.personalPriority,
    label: 'Поднимать личные заметки выше',
    hint: 'Меняет только локальное ранжирование и не удаляет справочные результаты.',
    className: 'search-priority-switch',
  });
  personalPriorityLabel.replaceWith(personalPrioritySwitch);
  dom.personalPrioritySwitch = personalPrioritySwitch;
}
