/**
 * An analysis is stale when the current input fingerprint (which folds in the
 * relevant data + prompt version + model) no longer matches the stored one.
 * Unrelated field changes don't change the fingerprint, so they don't stale it.
 */
export function isAnalysisStale(
  storedFingerprint: string,
  currentFingerprint: string,
): boolean {
  return storedFingerprint !== currentFingerprint;
}
