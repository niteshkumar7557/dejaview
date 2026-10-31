import { shortSha } from "./format";

export type RefKind = "post" | "pep" | "gh" | "sha" | "path" | "symbol";

/** How a reference is written in the product's mono face. */
export function refText(kind: RefKind, value: string): string {
  switch (kind) {
    case "post": return `#${value}`;
    case "pep": return `PEP ${value}`;
    case "gh": return value.startsWith("gh-") ? value : `gh-${value}`;
    case "sha": return shortSha(value);
    default: return value;
  }
}
