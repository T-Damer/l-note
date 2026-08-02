async function importPackFile(file) {
  try {
    const pack = JSON.parse(await file.text());
    await installPack(pack, { sizeBytes: file.size });
    toast(`Импортирован пакет «${pack.title}».`);
  } catch (error) {
