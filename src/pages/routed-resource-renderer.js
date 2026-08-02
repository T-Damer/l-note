export function createRoutedResourceRenderer({ renderers = {}, onMissing } = {}) {
  const registry = new Map(Object.entries(renderers));

  return Object.freeze({
    resourceTypes: Object.freeze([...registry.keys()]),

    render(route) {
      if (!route || route.kind !== 'resource') return false;
      const renderer = registry.get(route.resourceType);
      const opened = typeof renderer === 'function' ? renderer(route) : false;
      if (!opened && typeof onMissing === 'function') onMissing(route);
      return Boolean(opened);
    },

    supports(resourceType) {
      return registry.has(resourceType);
    },
  });
}
