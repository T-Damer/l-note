for (const button of document.querySelectorAll('[data-action="create-pack"]')) {
  button.addEventListener('click', () => navigateResource('package', 'new'));
}
