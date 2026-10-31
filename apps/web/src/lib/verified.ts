/**
 * A decision counts as verified only when it has quotes and every one of them matched its post.
 * A decision with no quotes has nothing checked, so it is not "verified".
 */
export function fullyVerified(d: { verifiedEvidence: number; totalEvidence: number }): boolean {
  return d.totalEvidence > 0 && d.verifiedEvidence === d.totalEvidence;
}
