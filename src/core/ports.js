const REQUIRED_METHODS = Object.freeze({
  search: Object.freeze(['search', 'suggest']),
  storage: Object.freeze(['getAll', 'getOne', 'putOne', 'deleteOne', 'clearStore', 'getSetting', 'setSetting', 'mode']),
  domainQueryPlanner: Object.freeze(['appliesToPack', 'expandQuery']),
  localModel: Object.freeze(['load', 'answer', 'unload']),
  speechRecognition: Object.freeze(['load', 'transcribe', 'cancel', 'unload']),
  evidenceVerifier: Object.freeze(['verify']),
});

function assertPort(kind, candidate) {
  if (!candidate || (typeof candidate !== 'object' && typeof candidate !== 'function')) {
    throw new TypeError(`${kind} port must be an object.`);
  }
  for (const method of REQUIRED_METHODS[kind]) {
    if (typeof candidate[method] !== 'function') {
      throw new TypeError(`${kind} port is missing method ${method}().`);
    }
  }
  return candidate;
}

export function defineSearchPort(candidate) {
  return assertPort('search', candidate);
}

export function defineStoragePort(candidate) {
  return assertPort('storage', candidate);
}

export function defineDomainQueryPlannerPort(candidate) {
  if (typeof candidate?.id !== 'string' || candidate.id.trim().length === 0) {
    throw new TypeError('domainQueryPlanner port requires a non-empty id.');
  }
  return assertPort('domainQueryPlanner', candidate);
}

export function defineLocalModelPort(candidate) {
  return assertPort('localModel', candidate);
}

export function defineSpeechRecognitionPort(candidate) {
  return assertPort('speechRecognition', candidate);
}

export function defineEvidenceVerifierPort(candidate) {
  return assertPort('evidenceVerifier', candidate);
}

export function activeDomainQueryExpanders(planners, packs) {
  const active = [];
  for (const input of planners ?? []) {
    const planner = defineDomainQueryPlannerPort(input);
    if (!(packs ?? []).some((pack) => planner.appliesToPack(pack))) continue;
    active.push((query) => planner.expandQuery(query));
  }
  return active;
}

export const portMethods = REQUIRED_METHODS;
