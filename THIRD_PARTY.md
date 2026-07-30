# Third-party components

L-Note loads the following open-source browser libraries from pinned jsDelivr URLs:

| Component | Version | License | Purpose |
|---|---:|---|---|
| MiniSearch | 7.2.0 | MIT | In-memory full-text, prefix and fuzzy search |
| Dexie | 4.4.4 | Apache-2.0 | IndexedDB persistence |
| WebLLM | 0.2.84 | Apache-2.0 | Optional browser-local WebGPU inference |

WebLLM is loaded only after the user requests a local model. Model artifacts have their own licences and are selected from WebLLM's prebuilt catalog at runtime; L-Note does not redistribute model weights.
