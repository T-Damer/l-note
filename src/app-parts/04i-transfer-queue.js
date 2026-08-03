import { createTransferQueue, TRANSFER_PRIORITY } from '../services/transfer-queue.js';
import { createPackageTransferHandler } from '../services/package-transfer.js';
import { createQueuedRuntimeLoader } from '../services/queued-runtime-loader.js';
import { createTransferQueueView } from '../pages/transfer-queue-view.js';
import { speechModelProfile } from '../speech.js';

const transferQueue = createTransferQueue({ storagePort });
const transferQueueHost = create('div', {
  id: 'transfer-queue-host',
  className: 'transfer-queue-host',
  'aria-live': 'polite',
});
document.body.append(transferQueueHost);
const transferQueueView = createTransferQueueView({
  queue: transferQueue,
  container: transferQueueHost,
});

const directPackageTransfer = createPackageTransferHandler({
  sha256Hex,
  installPack,
});
transferQueue.register('package', async (task, context) => {
  const result = await directPackageTransfer(task, context);
  toast(`Пакет «${result.title}» установлен.`);
  return result;
});

const directModelLoad = state.localAi.load.bind(state.localAi);
const directModelCancel = state.localAi.cancelLoad?.bind(state.localAi);
const queuedModelLoader = createQueuedRuntimeLoader({
  queue: transferQueue,
  kind: 'model',
  directLoad: directModelLoad,
  cancel: directModelCancel,
  priority: TRANSFER_PRIORITY.CURRENT_MODEL,
  resumeOnRestore: false,
  labelFor: (modelId) => localModelProfile(modelId)?.label ?? 'Локальная модель',
  async onLoaded(result, task) {
    state.lastModelLoad = result;
    state.localAiReady = true;
    markLocalModelCached(task.resourceId, true);
    finishLocalModelLoad();
    renderModelPageState();
  },
});
state.localAi.load = queuedModelLoader.load;

const speechPort = applicationAdapter.speechRecognitionPort;
const directSpeechLoad = speechPort.load.bind(speechPort);
const directSpeechCancel = speechPort.cancel.bind(speechPort);
const queuedSpeechLoader = createQueuedRuntimeLoader({
  queue: transferQueue,
  kind: 'speech-model',
  directLoad: directSpeechLoad,
  cancel: directSpeechCancel,
  priority: TRANSFER_PRIORITY.CURRENT_MODEL,
  resumeOnRestore: false,
  labelFor: (modelId) => speechModelProfile(modelId)?.label ?? 'Распознавание речи',
  async onLoaded(_result, task) {
    state.voiceSearchController?.notifyLoaded?.(task.resourceId);
  },
});
speechPort.load = queuedSpeechLoader.load;

downloadAndInstall = async function downloadAndInstallThroughQueue(entry, button) {
  const originalText = button?.textContent ?? '';
  if (button) {
    button.disabled = true;
    button.textContent = 'В очереди…';
  }
  try {
    const queued = await transferQueue.enqueue({
      kind: 'package',
      resourceId: entry.id,
      dedupeKey: `package:${entry.id}:${entry.version ?? entry.sha256 ?? 'latest'}`,
      label: entry.title ?? entry.id,
      priority: TRANSFER_PRIORITY.CURRENT_DOCUMENT,
      resumeOnRestore: true,
      metadata: { entry },
    });
    await queued.completion;
  } catch (error) {
    if (error?.name !== 'AbortError') {
      toast('Не удалось установить пакет. Повторите загрузку в панели операций.', 'error');
    }
  } finally {
    if (button?.isConnected) {
      button.disabled = false;
      button.textContent = originalText;
    }
  }
};

queueMicrotask(() => {
  void transferQueue.init().catch((error) => {
    console.error('Transfer queue initialization failed.', error);
    toast('Не удалось восстановить список загрузок.', 'error');
  });
});

Object.assign(state, {
  transferQueue,
  queuedModelLoader,
  queuedSpeechLoader,
});
Object.assign(dom, { transferQueueHost, transferQueueView });
