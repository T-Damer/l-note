function requireElement(value, label) {
  if (!(value instanceof Element)) throw new TypeError(`${label} must be a DOM element.`);
  return value;
}

function appendChildren(target, children) {
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child === null || child === undefined) continue;
    target.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/**
 * Generic routed-dialog view controller. It deliberately knows nothing about
 * knowledge domains, route parsing, MiniMed or resource schemas.
 */
export function createRoutedDialogController({ dialog, heading, body } = {}) {
  if (!(dialog instanceof HTMLDialogElement)) throw new TypeError('dialog must be an HTMLDialogElement.');
  requireElement(heading, 'heading');
  requireElement(body, 'body');

  const backButton = dialog.querySelector('[data-action="resource-back"]');
  const closeButton = dialog.querySelector('[data-action="close-resource-chain"]');

  return Object.freeze({
    dialog,
    heading,
    body,
    backButton,
    closeButton,

    show() {
      if (!dialog.open) dialog.showModal();
      document.body.classList.add('modal-open');
    },

    close() {
      if (dialog.open) dialog.close();
    },

    setBackAvailable(value) {
      if (backButton) backButton.hidden = !Boolean(value);
    },

    replaceHeading(children = []) {
      heading.replaceChildren();
      appendChildren(heading, children);
    },

    replaceBody(children = []) {
      body.replaceChildren();
      appendChildren(body, children);
    },

    appendBody(children = []) {
      appendChildren(body, children);
    },

    scrollTo(selector, options = { block: 'start' }) {
      if (!selector) return false;
      const target = body.querySelector(selector);
      target?.scrollIntoView(options);
      return Boolean(target);
    },
  });
}

export function closeRoutedDialogs(controllers = []) {
  for (const controller of controllers) controller?.close?.();
  document.body.classList.remove('modal-open');
}
