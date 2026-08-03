import init, {
  processPdf,
  version,
} from '../../vendor/pdf-inspector/pdf_inspector_wasm.js';

const ready = init();

self.addEventListener('message', async (event) => {
  const { id, buffer } = event.data ?? {};
  if (!id || !(buffer instanceof ArrayBuffer)) return;
  try {
    await ready;
    const result = processPdf(new Uint8Array(buffer), {
      profile: 'fidelity',
      includePageMarkers: true,
      includeImages: true,
    });
    self.postMessage({
      id,
      ok: true,
      result: { ...result, parserVersion: version() },
    });
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
