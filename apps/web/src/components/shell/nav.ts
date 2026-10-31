export interface NavItem {
  href: string;
  label: string;
  icon: "overview" | "decisions" | "pr" | "eval" | "ingest";
}

export const NAV: NavItem[] = [
  { href: "/", label: "Overview", icon: "overview" },
  { href: "/decisions", label: "Decisions", icon: "decisions" },
  { href: "/pr-checks", label: "PR checks", icon: "pr" },
  { href: "/eval", label: "Evaluation", icon: "eval" },
  { href: "/ingest", label: "Ingest", icon: "ingest" },
];

/** The nav item a path belongs to (topic pages live under Overview). */
export function activeNav(pathname: string): NavItem {
  if (pathname.startsWith("/topics/")) return NAV[0]!;
  return [...NAV].reverse().find((item) => item.href !== "/" && pathname.startsWith(item.href)) ?? NAV[0]!;
}
