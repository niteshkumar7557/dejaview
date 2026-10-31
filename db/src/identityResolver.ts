// Deciding whether two handles are the same person.
//
// The rules come from design.md §5.9:
//
//   - exact username match across platforms   -> medium
//   - same display name after normalizing     -> medium
//   - a Discourse profile linking a GitHub account -> high
//   - a noreply email or commit email matching a GitHub login -> high
//
// Every merge keeps the confidence and the evidence that produced it, so nobody has to take
// the answer on trust. Nothing here touches the database, which makes the rules easy to test.

export type Platform = "discourse" | "github" | "git" | "unknown";

export interface IdentityCandidate {
  platform: Platform;
  handle: string;
  displayName?: string | null;
  email?: string | null;
}

export interface MergeVerdict {
  /** 0..1. How sure we are that these are the same person. */
  confidence: number;
  /** The sentence a human can check. */
  evidence: string;
}

/** Lower case, and only the letters and digits, so "Niel.Girdhar" and "niel girdhar" match. */
export function normalizeHandle(handle: string): string {
  return handle.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** The same, but a display name may contain spaces and dots. */
export function normalizeDisplayName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * A GitHub noreply email looks like 12345+someone@users.noreply.github.com,
 * and it still says which login it belongs to.
 */
export function loginFromNoreplyEmail(email: string): string | null {
  const match = /^[^+]*\+([^@]+)@users\.noreply\.github\.com$/i.exec(email.trim());
  return match?.[1] ?? null;
}

/** True when the email belongs to that GitHub login. */
export function emailMatchesLogin(email: string | null | undefined, handle: string): boolean {
  if (!email) return false;
  const login = loginFromNoreplyEmail(email);
  if (!login) return false;
  return normalizeHandle(login) === normalizeHandle(handle);
}

/**
 * Judges whether two candidates are the same person.
 * Returns null when there is not enough evidence to say anything.
 */
export function judgeMerge(
  left: IdentityCandidate,
  right: IdentityCandidate,
): MergeVerdict | null {
  // The same handle on the same platform is the same identity, not a merge.
  if (left.platform === right.platform) return null;

  const leftHandle = normalizeHandle(left.handle);
  const rightHandle = normalizeHandle(right.handle);
  if (!leftHandle || !rightHandle) return null;

  // High: one email says both handles belong to the same inbox.
  if (left.email && right.email && left.email.trim().toLowerCase() === right.email.trim().toLowerCase()) {
    return {
      confidence: 0.9,
      evidence: `both use the email address ${left.email}`,
    };
  }

  // High: a commit email says which GitHub login it came from.
  const emailSide = left.email ?? right.email;
  const emailPlatform = left.email ? left : right;
  const otherPlatform = left.email ? right : left;
  if (
    emailPlatform.platform === "git" &&
    emailMatchesLogin(emailSide, emailPlatform.handle) &&
    normalizeHandle(otherPlatform.handle) === normalizeHandle(emailPlatform.handle)
  ) {
    return {
      confidence: 0.9,
      evidence: `the noreply email ${emailSide} names the ${otherPlatform.platform} login ${otherPlatform.handle}`,
    };
  }

  // Medium: the same name on two different platforms.
  if (leftHandle === rightHandle) {
    return {
      confidence: 0.6,
      evidence: `the same handle "${left.handle}" on ${left.platform} and ${right.platform}`,
    };
  }

  // Medium: the same display name on two different platforms.
  const leftName = left.displayName ? normalizeDisplayName(left.displayName) : "";
  const rightName = right.displayName ? normalizeDisplayName(right.displayName) : "";
  if (leftName && leftName === rightName) {
    return {
      confidence: 0.5,
      evidence: `the same display name "${left.displayName}" on ${left.platform} and ${right.platform}`,
    };
  }

  return null;
}
