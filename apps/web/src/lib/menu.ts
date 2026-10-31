export type MenuTransition = "open" | "close" | "none";

/** What the phone menu sheet should do this pass. Opening and closing are exclusive, so one never undoes the other. */
export function menuTransition(wantOpen: boolean, sheetHidden: boolean): MenuTransition {
  if (wantOpen) return sheetHidden ? "open" : "none";
  return sheetHidden ? "none" : "close";
}
