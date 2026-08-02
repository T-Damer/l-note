const voiceSearchPort = applicationAdapter.speechRecognitionPort;
const voiceSearchRow = dom.searchForm.querySelector('.search-input-row');
const voiceSearchTrigger = Button({
  variant: 'icon',
  icon: 'microphone',
  className: 'voice-search-toggle',
  title: 'Голосовой поиск',
  'aria-label': 'Открыть голосовой поиск',
  'aria-pressed': 'false',
  'aria-expanded': 'false',
});
const voiceSearchSlot = create('div', { className: 'voice-search-slot' });
const searchSubmitButton = voiceSearchRow?.querySelector('[type="submit"]');
if (voiceSearchRow && searchSubmitButton) {
  voiceSearchRow.insertBefore(voiceSearchTrigger, searchSubmitButton);
  voiceSearchRow.after(voiceSearchSlot);
}

const voiceSearchController = createVoiceSearchController({
  trigger: voiceSearchTrigger,
  slot: voiceSearchSlot,
  input: dom.searchInput,
  speechPort: voiceSearchPort,
  storagePort,
  onTranscript: (text) => runSearch(text),
  onActivityProgress: (activity) => dom.sidebarController?.setActivityProgress('search', activity),
  onError: (message) => toast(message, 'error'),
});

voiceSearchController.init().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  toast(message, 'error');
});

Object.assign(state, { voiceSearchPort, voiceSearchController });
