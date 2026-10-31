import type { NavItem } from "./nav";

const PATHS: Record<NavItem["icon"] | "menu" | "close" | "search", string> = {
  overview: "M2.5 2.5h4.5v4.5h-4.5zM9 2.5h4.5v4.5H9zM2.5 9h4.5v4.5h-4.5zM9 9h4.5v4.5H9z",
  decisions: "M3 4h10M3 8h10M3 12h6",
  pr: "M4.5 3.5v9M4.5 3.5a1.5 1.5 0 1 0 0 .01M4.5 12.5a1.5 1.5 0 1 0 0 .01M11.5 12.5a1.5 1.5 0 1 0 0 .01M11.5 11V6.5a2 2 0 0 0-2-2H7.5M8.5 3l-1.5 1.5L8.5 6",
  eval: "M8 2.5a5.5 5.5 0 1 0 0 11a5.5 5.5 0 1 0 0-11M8 5.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5",
  ingest: "M8 2.5v8M4.5 7L8 10.5L11.5 7M3 13.5h10",
  menu: "M2.5 4.5h11M2.5 8h11M2.5 11.5h11",
  close: "M4 4l8 8M12 4l-8 8",
  search: "M7 2.5a4.5 4.5 0 1 0 0 9a4.5 4.5 0 1 0 0-9M10.5 10.5l3 3",
};

export function Icon({ name, size = 16 }: { name: keyof typeof PATHS; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
