function reusableSearchArtifactFile(previous, pack, source) {
  if (source.searchArtifactFile) return source.searchArtifactFile;
  const sameVersion = previous?.pack?.version === pack.version;
  const sameArtifact = previous?.pack?.searchArtifact?.sha256
    && previous.pack.searchArtifact.sha256 === pack.searchArtifact?.sha256;
  return sameVersion && sameArtifact ? previous.searchArtifactFile ?? null : null;
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
    searchArtifactFile: reusableSearchArtifactFile(previous, pack, source),
    pack,
  };
}
