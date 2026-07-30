bootstrap().catch((error) => {
  console.error(error);
  toast(error instanceof Error ? error.message : String(error), 'error');
});
