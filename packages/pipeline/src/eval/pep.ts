// Reading a real PEP's "Rejected Ideas". ONLY the evaluation uses this, after extraction has finished:
// extraction must never see the PEP, or the test would be meaningless.

import type { GroundTruthItem } from "@dejaview/shared";

export function pepUrl(pepNumber: number): string {
  return `https://raw.githubusercontent.com/python/peps/main/peps/pep-${String(pepNumber).padStart(4, "0")}.rst`;
}

export async function fetchPep(pepNumber: number, fetchImpl: typeof fetch = fetch): Promise<string> {
  const response = await fetchImpl(pepUrl(pepNumber), { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Could not fetch PEP ${pepNumber}: HTTP ${response.status}`);
  return response.text();
}

/** Section titles that hold the ideas a PEP turned down. */
const REJECTED_SECTION = /^(rejected|abandoned|discarded)\s+(ideas?|alternatives?|proposals?|approaches|syntax(es)?)(\s+and\s+\w+)?$|^alternatives?(\s+considered)?$|^alternative\s+(proposals?|ideas?|approaches)$/i;

const UNDERLINE = /^([=\-~^"'`#*+:._])\1{2,}\s*$/;
const LIST_ITEM = /^(#\.|\d+\.|\*|-)\s+/;

interface Heading {
  line: number;
  title: string;
  level: number;
}

/** RST headings: a text line followed by a line of one repeated punctuation character. */
export function findHeadings(lines: string[]): Heading[] {
  const levels: string[] = [];
  const headings: Heading[] = [];
  for (let i = 0; i + 1 < lines.length; i++) {
    const title = (lines[i] as string).trim();
    const under = lines[i + 1] as string;
    const match = UNDERLINE.exec(under);
    if (!title || !match || UNDERLINE.test(title) || under.trim().length < title.length) continue;
    const char = match[1] as string;
    if (!levels.includes(char)) levels.push(char);
    headings.push({ line: i, title, level: levels.indexOf(char) });
  }
  return headings;
}

/** Removes the RST markup that would get in the way of comparing text. */
export function plainRst(text: string): string {
  return text
    .replace(/:[a-z:]+:`([^`<]*?)(\s*<[^>]*>)?`/g, "$1")
    .replace(/`([^`<]+?)\s*<[^>]*>`_+/g, "$1")
    .replace(/``([^`]+)``/g, "$1")
    .replace(/`([^`]+)`_*/g, "$1")
    .replace(/::\s*$/gm, ":")
    .replace(/\s+/g, " ")
    .trim();
}

function firstSentence(text: string): string {
  const sentence = /^(.+?[.!?])(\s|$)/.exec(text)?.[1] ?? text;
  return sentence.length > 100 ? `${sentence.slice(0, 97).trimEnd()}…` : sentence;
}

/**
 * The ground truth: one item per sub-heading of every rejected-ideas section, or, when a section has
 * no sub-headings, one item per top-level list entry (PEP 701 uses "#." lists).
 */
export function parseRejectedIdeas(rst: string): GroundTruthItem[] {
  const lines = rst.replace(/\r\n/g, "\n").split("\n");
  const headings = findHeadings(lines);
  const items: GroundTruthItem[] = [];

  headings.forEach((section, index) => {
    if (!REJECTED_SECTION.test(section.title)) return;
    const end = headings.slice(index + 1).find((h) => h.level <= section.level)?.line ?? lines.length;
    const subs = headings.filter((h) => h.line > section.line && h.line < end && h.level === section.level + 1);

    if (subs.length > 0) {
      subs.forEach((sub, i) => {
        const subEnd = subs[i + 1]?.line ?? end;
        const text = plainRst(lines.slice(sub.line + 2, subEnd).join("\n"));
        items.push({ title: plainRst(sub.title), text });
      });
      return;
    }

    const body = lines.slice(section.line + 2, end);
    const entries: string[][] = [];
    for (const line of body) {
      if (LIST_ITEM.test(line)) entries.push([line.replace(LIST_ITEM, "")]);
      else if (entries.length > 0) (entries[entries.length - 1] as string[]).push(line);
    }
    if (entries.length > 0) {
      for (const entry of entries) {
        const text = plainRst(entry.join("\n"));
        if (text) items.push({ title: firstSentence(text), text });
      }
      return;
    }
    const text = plainRst(body.join("\n"));
    if (text) items.push({ title: plainRst(section.title), text });
  });

  return items;
}
