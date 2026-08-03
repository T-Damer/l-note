function reusableSearchArtifactFiles(previous, pack, source) {
  if (Array.isArray(source.searchArtifactFiles)) return source.searchArtifactFiles;
  const descriptors = new Map((pack.searchArtifacts ?? []).map((artifact) => [artifact.id, artifact]));
  return (previous?.searchArtifactFiles ?? []).filter((file) => {
    const descriptor = descriptors.get(file?.id);
    return descriptor
      && descriptor.sha256 === file.sha256
      && descriptor.corpusFingerprint === file.corpusFingerprint
      && file.blob;
  });
}

export function createInstalledPackRecord({
  pack,
  previous = null,
  source = {},
  installedAt = new Date().toISOString(),
  fallbackSizeBytes = 0,
}) {
  return {
    id: pack.id,
    enabled: previous?.enabled ?? true,
    installedAt,
    sizeBytes: source.sizeBytes ?? fallbackSizeBytes,
    sourceUrl: source.url ?? previous?.sourceUrl ?? null,
    sha256: source.sha256 ?? previous?.sha256 ?? null,
    searchArtifactFiles: reusableSearchArtifactFiles(previous, pack, source),
    pack,
  };
}
