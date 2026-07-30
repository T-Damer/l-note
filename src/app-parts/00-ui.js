import { Button, Card, Field, SourceCard, Switch, bindRoutedDialog } from './ui/components.js';
import { Icon, iconNameForSearchResult } from './ui/icons.js';
import { Text } from './ui/text.js';

const existingPersonalPriority = document.querySelector('#personal-priority');
if (existingPersonalPriority) {
  const { element } = Switch({
    id: 'personal-priority',
    name: 'personal-priority',
    label: 'Поднимать личные заметки выше',
    checked: existingPersonalPriority.checked,
  });
  existingPersonalPriority.closest('label')?.replaceWith(element);
}
