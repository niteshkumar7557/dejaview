import { describe, expect, it } from "vitest";
import { toDecisionCard } from "../mocks/views";
import { madrFileName, renderMadr } from "./madr";

const DASH = "https://dejaview.example";

describe("renderMadr", () => {
  it("marks unverified quotes as unverified", () => {
    const md = renderMadr(toDecisionCard(11)!, DASH);
    expect(md).toContain("* Status: rejected");
    expect(md).toContain(", unverified)");
    expect(md).not.toContain(", verified)");
    expect(md.trimEnd().endsWith(`${DASH}/decisions/11`)).toBe(true);
  });

  it("says when linked code is gone at HEAD and uses the original path", () => {
    const md = renderMadr(toDecisionCard(10)!, DASH);
    expect(md).toContain("`Tools/peg_generator/scripts/fstring_tokens.py`, linked by path_mention, not found at HEAD");
    expect(md).toContain("* Decided: —");
  });

  it("names the current path of relocated code", () => {
    const md = renderMadr(toDecisionCard(7)!, DASH);
    expect(md).toContain("* Code: `Parser/lexer/lexer.c` (tok_get), linked by pr_ref");
  });

  it("renders a full accepted record", () => {
    expect(renderMadr(toDecisionCard(1)!, DASH)).toMatchSnapshot();
  });
});

describe("madrFileName", () => {
  it("builds topic, id and up to six title words", () => {
    const card = { ...toDecisionCard(8)!, id: 12, title: "Allow backslashes inside f-string expressions" };
    expect(madrFileName(card)).toBe("pep-701-d12-allow-backslashes-inside-f-string-expressions.md");
  });
  it("cuts long titles to six words", () => {
    const card = { ...toDecisionCard(1)!, title: "One two three four five six seven eight" };
    expect(madrFileName(card)).toBe("pep-698-d1-one-two-three-four-five-six.md");
  });
});
