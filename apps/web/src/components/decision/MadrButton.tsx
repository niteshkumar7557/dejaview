"use client";

import type { DecisionCard } from "@dejaview/shared";
import { madrFileName, renderMadr } from "@/lib/madr";
import { Button } from "../ui/Button";

export function MadrButton({ card }: { card: DecisionCard }) {
  function download() {
    const blob = new Blob([renderMadr(card, window.location.origin)], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = madrFileName(card);
    a.click();
    URL.revokeObjectURL(url);
  }
  return <Button variant="primary" onClick={download}>Export MADR</Button>;
}
