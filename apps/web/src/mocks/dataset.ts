// SAMPLE DATA for building the UI before the API exists.
// Handles are fictional and every quote is invented sample text, written to look like what the
// pipeline will produce. Replace with Abhijeet's real outputs (examples/pep-*/output) when they land.
// Only rows live here: every count, total and ratio on screen is computed from them in views.ts.

import type {
  CodeAnchor,
  Confidence,
  DecisionKind,
  DecisionStatus,
  GroundTruthItem,
  PrCheckView,
  ReasonAgreement,
  SourceView,
  TriageLabel,
} from "@dejaview/shared";

export interface MockTopic {
  slug: string;
  title: string;
  pepNumber: number;
  sources: SourceView[];
  /** Base URL of the main thread; a post's permalink is `${threadUrl}/${postNumber}`. */
  threadUrl: string;
  postCount: number;
  seed: number;
  /** ISO dates of the first and last post. */
  start: string;
  end: string;
  /** The PEP author, who writes post #1. */
  author: string;
  opener: string;
  /** Sentences the thread generator draws ordinary posts from. */
  filler: string[];
}

export interface MockQuote {
  post: number;
  quote: string;
  /** Set to false for a quote the verifier could not find in its post. */
  verified?: false;
  /** Match score for an unverified quote (verified quotes score 1.00). */
  score?: number;
}

export interface MockReason {
  text: string;
  quotes: MockQuote[];
}

export interface MockDecision {
  id: number;
  topicSlug: string;
  title: string;
  kind: DecisionKind;
  status: DecisionStatus;
  summary: string;
  confidence: Confidence;
  decidedAt: string | null;
  reasons: MockReason[];
  anchors: CodeAnchor[];
}

/** A hand-written post that evidence points at. Its body is `lead` plus the verified quotes citing it. */
export interface MockPost {
  topicSlug: string;
  post: number;
  author: string;
  lead: string;
  label: TriageLabel;
}

export interface MockEvalRun {
  id: number;
  topicSlug: string;
  createdAt: string;
  items: { item: GroundTruthItem; decisionId: number | null; agreement: ReasonAgreement | null }[];
}

export const MODEL_TRIAGE = "qwen3.5:4b";
export const MODEL_EXTRACT = "qwen3.5:9b";
export const CPYTHON = "python/cpython";

export const topics: MockTopic[] = [
  {
    slug: "pep-698",
    title: "Override decorator for static typing",
    pepNumber: 698,
    sources: [
      { kind: "discourse", url: "https://discuss.python.org/t/pep-698-override-decorator-for-static-typing/20839", title: "PEP 698: Override decorator for static typing" },
      { kind: "github_pr", url: "https://github.com/python/cpython/pull/101564", title: "gh-101561: Add typing.override decorator" },
    ],
    threadUrl: "https://discuss.python.org/t/pep-698-override-decorator-for-static-typing/20839",
    postCount: 64,
    seed: 698,
    start: "2022-11-08T10:00:00Z",
    end: "2023-02-20T18:00:00Z",
    author: "lukas_w",
    opener:
      "This PEP proposes an @override decorator in typing so that type checkers can tell when a method meant to override a base class method no longer does.",
    filler: [
      "Pyright already has an experimental flag for this, so we have some field experience.",
      "How does this interact with __init_subclass__ hooks?",
      "Could the docs show an example with a Protocol base class?",
      "I tried the reference implementation on our codebase and it found two stale overrides.",
      "Is the decorator expected to be first or last when stacked?",
      "Mypy would need a small change to understand the decorator in stub files.",
      "This mirrors what Java and C# users already expect.",
      "Does the attribute survive functools.wraps?",
      "Typeshed can adopt this once checkers support it.",
      "The naming bikeshed seems settled on override.",
      "We should mention typing_extensions availability in the backwards compatibility section.",
      "A small example with a renamed base method would make the motivation clearer.",
    ],
  },
  {
    slug: "pep-701",
    title: "Syntactic formalization of f-strings",
    pepNumber: 701,
    sources: [
      { kind: "discourse", url: "https://discuss.python.org/t/pep-701-syntactic-formalization-of-f-strings/22046", title: "PEP 701: Syntactic formalization of f-strings" },
      { kind: "github_issue", url: "https://github.com/python/cpython/issues/102856", title: "gh-102856: Implement PEP 701" },
    ],
    threadUrl: "https://discuss.python.org/t/pep-701-syntactic-formalization-of-f-strings/22046",
    postCount: 212,
    seed: 701,
    start: "2022-12-19T09:00:00Z",
    end: "2023-03-14T20:00:00Z",
    author: "pkoenig",
    opener:
      "This PEP moves f-string parsing out of a hand-written sub-parser and into the PEG grammar, with the tokenizer emitting dedicated f-string tokens.",
    filler: [
      "Error messages inside replacement fields are the part users notice most.",
      "Syntax highlighters will need updates either way.",
      "What is the performance impact on tokenizing large files?",
      "Black already parses f-strings separately, so this would simplify things for us.",
      "Can we keep the old behaviour behind a flag for one release?",
      "The PEG grammar changes look small once the tokenizer side is done.",
      "Comments inside multi-line replacement fields would be a nice side effect.",
      "How do format specs with nested replacement fields tokenize now?",
      "I ran the test suite with the branch and everything passes on Linux.",
      "Editors that rely on regexes for strings will be confused by nested quotes.",
      "This also fixes the long-standing problem with error locations in f-strings.",
      "Please include a table of what changes for users and what stays the same.",
    ],
  },
  {
    slug: "pep-695",
    title: "Type parameter syntax",
    pepNumber: 695,
    sources: [
      { kind: "discourse", url: "https://discuss.python.org/t/pep-695-type-parameter-syntax/21646", title: "PEP 695: Type parameter syntax" },
      { kind: "discourse", url: "https://discuss.python.org/t/pep-695-scoping-of-type-parameters/24502", title: "PEP 695: scoping of type parameters" },
      { kind: "github_pr", url: "https://github.com/python/cpython/pull/103764", title: "gh-103763: Implement PEP 695" },
    ],
    threadUrl: "https://discuss.python.org/t/pep-695-type-parameter-syntax/21646",
    postCount: 318,
    seed: 695,
    start: "2022-07-12T08:00:00Z",
    end: "2023-04-02T17:00:00Z",
    author: "ewa.n",
    opener:
      "This PEP proposes a dedicated syntax for declaring type parameters on classes, functions and type aliases, replacing module-level TypeVar assignments.",
    filler: [
      "The scoping rules are the part I would like to see spelled out more.",
      "How do runtime introspection tools see the new parameters?",
      "This will make generic code much easier to teach.",
      "Can a type parameter shadow a module-level name?", // taste-skill-ignore: the word, not a CSS shadow
      "The bracket syntax reads naturally next to subscripted generics.",
      "What happens to existing TypeVar objects created the old way?",
      "Pyright has a prototype of this behind a flag.",
      "The lazy evaluation of aliases needs a clear story for forward references.",
      "I'd like an example with a bounded type parameter.",
      "Please keep the old way working for at least a few releases.",
      "The annotation scope idea is subtle but seems sound.",
      "Variance inference will remove a lot of boilerplate in our stubs.",
    ],
  },
];

export const posts: MockPost[] = [
  // PEP 698
  { topicSlug: "pep-698", post: 1, author: "lukas_w", lead: "Summary of the proposal:", label: "proposal" },
  { topicSlug: "pep-698", post: 9, author: "mira.okafor", lead: "On making it mandatory:", label: "objection" },
  { topicSlug: "pep-698", post: 14, author: "sato_k", lead: "On runtime checks:", label: "objection" },
  { topicSlug: "pep-698", post: 22, author: "lukas_w", lead: "Responding to both points above.", label: "decision" },
  { topicSlug: "pep-698", post: 31, author: "b.adeyemi", lead: "For properties:", label: "alternative" },
  { topicSlug: "pep-698", post: 38, author: "b.adeyemi", lead: "Following up on my earlier idea.", label: "decision" },
  { topicSlug: "pep-698", post: 57, author: "ines.r", lead: "Speaking for the typing council review:", label: "decision" },
  // PEP 701
  { topicSlug: "pep-701", post: 1, author: "pkoenig", lead: "Summary of the proposal:", label: "proposal" },
  { topicSlug: "pep-701", post: 12, author: "tdelacroix", lead: "On keeping the current tokenizer behaviour:", label: "objection" },
  { topicSlug: "pep-701", post: 27, author: "pkoenig", lead: "Answering the tokenizer question.", label: "decision" },
  { topicSlug: "pep-701", post: 44, author: "r.chandra", lead: "About backslashes:", label: "objection" },
  { topicSlug: "pep-701", post: 52, author: "h-lindqvist", lead: "On quote reuse:", label: "support" },
  { topicSlug: "pep-701", post: 68, author: "gpaz", lead: "On nesting:", label: "alternative" },
  { topicSlug: "pep-701", post: 75, author: "pkoenig", lead: "On the nesting limit.", label: "decision" },
  { topicSlug: "pep-701", post: 103, author: "jvanloon", lead: "A different idea for regex users.", label: "alternative" },
  { topicSlug: "pep-701", post: 131, author: "tdelacroix", lead: "On the tokenize module:", label: "question" },
  { topicSlug: "pep-701", post: 158, author: "sato_k", lead: "Benchmark notes.", label: "support" },
  { topicSlug: "pep-701", post: 190, author: "ines.r", lead: "Steering council notes:", label: "decision" },
  // PEP 695
  { topicSlug: "pep-695", post: 1, author: "ewa.n", lead: "Summary of the proposal:", label: "proposal" },
  { topicSlug: "pep-695", post: 18, author: "jvanloon", lead: "Why not angle brackets?", label: "alternative" },
  { topicSlug: "pep-695", post: 24, author: "ewa.n", lead: "On angle brackets.", label: "decision" },
  { topicSlug: "pep-695", post: 47, author: "mira.okafor", lead: "On keeping TypeVar assignments:", label: "objection" },
  { topicSlug: "pep-695", post: 63, author: "r.chandra", lead: "On variance:", label: "alternative" },
  { topicSlug: "pep-695", post: 71, author: "ewa.n", lead: "On variance keywords.", label: "decision" },
  { topicSlug: "pep-695", post: 96, author: "gpaz", lead: "A keyword prefix idea:", label: "alternative" },
  { topicSlug: "pep-695", post: 120, author: "h-lindqvist", lead: "On alias evaluation:", label: "objection" },
  { topicSlug: "pep-695", post: 142, author: "ewa.n", lead: "On defaults.", label: "decision" },
  { topicSlug: "pep-695", post: 177, author: "lukas_w", lead: "A where clause:", label: "alternative" },
  { topicSlug: "pep-695", post: 205, author: "b.adeyemi", lead: "On the where clause.", label: "objection" },
  { topicSlug: "pep-695", post: 266, author: "ines.r", lead: "Steering council decision:", label: "decision" },
];

const anchor = (
  originalPath: string,
  symbol: string | null,
  linkMethod: CodeAnchor["linkMethod"],
  evidencePostId: number,
  extra: Partial<CodeAnchor> = {},
): CodeAnchor => ({
  repo: CPYTHON,
  symbol,
  originalPath,
  originalCommit: "a3f09c1e2b7d4c5a8e9f0b1c2d3e4f5a6b7c8d9e",
  currentPath: originalPath,
  relocatedBy: null,
  linkMethod,
  evidencePostId,
  ...extra,
});

export const decisions: MockDecision[] = [
  // ───────── PEP 698 ─────────
  {
    id: 1, topicSlug: "pep-698", kind: "proposal", status: "accepted", confidence: "high", decidedAt: "2023-02-14T12:00:00Z",
    title: "Add an @override decorator to typing",
    summary: "Type checkers flag a method marked @override when no base class defines it, catching overrides broken by a rename.",
    reasons: [
      { text: "Renaming a base class method silently breaks subclasses today; the decorator makes that an error.",
        quotes: [{ post: 1, quote: "a method meant to override a base class method no longer does once the base method is renamed" }] },
      { text: "It costs nothing at runtime beyond setting one attribute.",
        quotes: [{ post: 22, quote: "the only runtime effect is setting __override__ = True on the function" }] },
    ],
    anchors: [anchor("Lib/typing.py", "override", "pr_ref", 57), anchor("Lib/test/test_typing.py", "OverrideDecoratorTests", "pr_ref", 57)],
  },
  {
    id: 2, topicSlug: "pep-698", kind: "alternative", status: "rejected", confidence: "high", decidedAt: "2023-01-10T12:00:00Z",
    title: "Make @override mandatory for every overriding method",
    summary: "Requiring the decorator everywhere was turned down; strictness stays an opt-in type checker setting.",
    reasons: [
      { text: "It would turn every existing overriding method into an error overnight.",
        quotes: [{ post: 9, quote: "making it mandatory would flag every existing subclass in the ecosystem on day one" }] },
      { text: "Type checkers can offer a strict mode without the language requiring it.",
        quotes: [{ post: 22, quote: "a strict mode belongs in the type checker configuration, not in the PEP" }] },
    ],
    anchors: [],
  },
  {
    id: 3, topicSlug: "pep-698", kind: "alternative", status: "rejected", confidence: "high", decidedAt: "2023-01-10T12:00:00Z",
    title: "Enforce @override at runtime",
    summary: "Checking overrides when the class is created was rejected as slow and redundant with static checking.",
    reasons: [
      { text: "Walking the MRO for every decorated method slows down class creation.",
        quotes: [{ post: 14, quote: "walking the MRO for every decorated method would slow down class creation for everyone" }] },
      { text: "Static checkers already report the error before the code runs.",
        quotes: [{ post: 22, quote: "static checkers already report this before the code ever runs" }] },
    ],
    anchors: [anchor("Lib/typing.py", "override", "symbol_mention", 14)],
  },
  {
    id: 4, topicSlug: "pep-698", kind: "alternative", status: "withdrawn", confidence: "medium", decidedAt: "2022-12-02T12:00:00Z",
    title: "Add a separate override decorator for properties",
    summary: "Withdrawn by its proposer once it was shown that @override stacks with @property.",
    reasons: [
      { text: "The plain decorator already works when stacked under @property.",
        quotes: [{ post: 38, quote: "I withdraw the suggestion, stacking @override under @property already works" }] },
    ],
    anchors: [],
  },
  // ───────── PEP 701 ─────────
  {
    id: 5, topicSlug: "pep-701", kind: "proposal", status: "accepted", confidence: "high", decidedAt: "2023-03-14T12:00:00Z",
    title: "Parse f-strings in the PEG grammar with dedicated tokens",
    summary: "The tokenizer emits FSTRING_START, FSTRING_MIDDLE and FSTRING_END so the main parser handles f-strings directly.",
    reasons: [
      { text: "One parser means one set of error messages and locations.",
        quotes: [{ post: 1, quote: "the tokenizer emitting dedicated f-string tokens" }, { post: 190, quote: "error locations inside replacement fields finally point at the right column" }] },
      { text: "The performance cost measured on the stdlib is negligible.",
        quotes: [{ post: 158, quote: "tokenizing the whole stdlib is within one percent of main" }] },
    ],
    anchors: [
      anchor("Grammar/python.gram", "fstring", "path_mention", 27),
      anchor("Parser/tokenizer.c", "tok_get_fstring_mode", "pr_ref", 27, { currentPath: "Parser/lexer/lexer.c", relocatedBy: "git-follow" }),
    ],
  },
  {
    id: 6, topicSlug: "pep-701", kind: "proposal", status: "accepted", confidence: "high", decidedAt: "2023-03-14T12:00:00Z",
    title: "Allow the same quote character inside replacement fields",
    summary: "f\"{x[\"key\"]}\" becomes valid; the old rule forced users to alternate quote styles.",
    reasons: [
      { text: "Alternating quotes is a common source of confusion for beginners.",
        quotes: [{ post: 52, quote: "having to alternate quote styles is the most common f-string question we get from beginners" }] },
    ],
    anchors: [anchor("Grammar/python.gram", "fstring_replacement_field", "path_mention", 52)],
  },
  {
    id: 7, topicSlug: "pep-701", kind: "alternative", status: "rejected", confidence: "high", decidedAt: "2023-01-20T12:00:00Z",
    title: "Keep f-strings as one STRING token parsed after tokenizing",
    summary: "Keeping the separate sub-parser was rejected because it cannot support nested quotes or good error locations.",
    reasons: [
      { text: "A single opaque token cannot represent nested quotes.",
        quotes: [{ post: 27, quote: "a single STRING token cannot represent nested quotes without a second parser" }] },
      { text: "Two parsers keep diverging, which is where most f-string bugs came from.",
        quotes: [{ post: 27, quote: "two parsers that drift apart is where most f-string bugs have come from" }, { post: 12, quote: "the current tokenizer behaviour is at least well understood by tools" }] },
    ],
    anchors: [
      anchor("Parser/tokenizer.c", "tok_get", "pr_ref", 27, { currentPath: "Parser/lexer/lexer.c", relocatedBy: "git-follow" }),
      anchor("Parser/string_parser.c", "fstring_find_expr", "path_mention", 12),
    ],
  },
  {
    id: 8, topicSlug: "pep-701", kind: "alternative", status: "rejected", confidence: "high", decidedAt: "2023-02-02T12:00:00Z",
    title: "Keep the ban on backslashes inside f-string expressions",
    summary: "The restriction on backslashes in replacement fields was dropped instead of kept.",
    reasons: [
      { text: "The backslash ban was an artefact of the old parser, not a design choice.",
        quotes: [{ post: 44, quote: "the backslash restriction only exists because of how the old sub-parser worked" }] },
      { text: "Users hit the backslash ban when joining with newlines.",
        quotes: [{ post: 44, quote: "people hit it every time they try to join lines with a newline inside an f-string" }] },
    ],
    anchors: [anchor("Parser/string_parser.c", "fstring_find_expr", "symbol_mention", 44)],
  },
  {
    id: 9, topicSlug: "pep-701", kind: "alternative", status: "rejected", confidence: "medium", decidedAt: "2023-02-09T12:00:00Z",
    title: "Limit f-string nesting to a fixed depth in the grammar",
    summary: "A grammar-level nesting limit was rejected; the tokenizer keeps only a safety limit.",
    reasons: [
      { text: "Any fixed depth in the grammar is arbitrary.",
        quotes: [{ post: 68, quote: "any fixed depth would be arbitrary" }] },
      { text: "The tokenizer already has a stack limit that prevents abuse.",
        quotes: [{ post: 75, quote: "the tokenizer keeps its own stack limit, so the grammar does not need one" }] },
    ],
    anchors: [anchor("Parser/tokenizer.c", "MAXFSTRINGLEVEL", "symbol_mention", 75, { currentPath: "Parser/lexer/state.h", relocatedBy: "git-follow" })],
  },
  {
    id: 10, topicSlug: "pep-701", kind: "proposal", status: "open", confidence: "medium", decidedAt: null,
    title: "Emit the new f-string tokens from the tokenize module",
    summary: "Whether Lib/tokenize.py should expose the new tokens was left open for tool authors to weigh in.",
    reasons: [
      { text: "Tools that use tokenize would see a different token stream.",
        quotes: [{ post: 131, quote: "tools built on the tokenize module would suddenly see a different token stream" }] },
    ],
    anchors: [
      anchor("Lib/tokenize.py", "generate_tokens", "path_mention", 131),
      anchor("Tools/peg_generator/scripts/fstring_tokens.py", null, "path_mention", 131, { currentPath: null }),
    ],
  },
  {
    id: 11, topicSlug: "pep-701", kind: "alternative", status: "rejected", confidence: "low", decidedAt: "2023-02-23T12:00:00Z",
    title: "Add a separate raw f-string prefix for regular expressions",
    summary: "A dedicated prefix for regex-friendly f-strings was proposed and not taken up.",
    reasons: [
      { text: "rf-strings already cover the regex use case.",
        quotes: [{ post: 103, quote: "rf strings already do exactly this for regex patterns", verified: false, score: 0.58 }] },
      { text: "A new prefix adds another rule to learn for little gain.",
        quotes: [{ post: 103, quote: "yet another string prefix is more to teach than it saves", verified: false, score: 0.44 }] },
    ],
    anchors: [],
  },
  // ───────── PEP 695 ─────────
  {
    id: 12, topicSlug: "pep-695", kind: "proposal", status: "accepted", confidence: "high", decidedAt: "2023-04-02T12:00:00Z",
    title: "Declare type parameters in brackets after the name",
    summary: "class C[T]: and def f[T](x: T) -> T: declare type parameters where they are used.",
    reasons: [
      { text: "Parameters are declared where they are used, with clear scope.",
        quotes: [{ post: 1, quote: "a dedicated syntax for declaring type parameters on classes, functions and type aliases" }, { post: 266, quote: "type parameters are declared where they are used and scoped to that definition" }] },
    ],
    anchors: [anchor("Grammar/python.gram", "type_params", "pr_ref", 266), anchor("Objects/typevarobject.c", null, "pr_ref", 266)],
  },
  {
    id: 13, topicSlug: "pep-695", kind: "proposal", status: "accepted", confidence: "high", decidedAt: "2023-04-02T12:00:00Z",
    title: "Add a type statement for type aliases",
    summary: "type ListOrSet[T] = list[T] | set[T] declares a generic alias that is evaluated lazily.",
    reasons: [
      { text: "Aliases get their own declaration and lazy evaluation.",
        quotes: [{ post: 266, quote: "the type statement gives aliases their own declaration and evaluates lazily" }] },
    ],
    anchors: [anchor("Objects/typevarobject.c", "typealias_new", "pr_ref", 266)],
  },
  {
    id: 14, topicSlug: "pep-695", kind: "alternative", status: "rejected", confidence: "high", decidedAt: "2022-09-30T12:00:00Z",
    title: "Use angle brackets like other languages",
    summary: "def f<T>(x: T) was rejected because < and > are already comparison operators.",
    reasons: [
      { text: "Angle brackets are ambiguous with comparison operators in the grammar.",
        quotes: [{ post: 24, quote: "angle brackets are ambiguous with the comparison operators in expressions" }] },
      { text: "Square brackets already mean generics in Python.",
        quotes: [{ post: 24, quote: "square brackets already mean generics in Python, so readers know them" }, { post: 18, quote: "angle brackets would feel familiar to people coming from TypeScript" }] },
    ],
    anchors: [anchor("Grammar/python.gram", "type_params", "symbol_mention", 24)],
  },
  {
    id: 15, topicSlug: "pep-695", kind: "alternative", status: "rejected", confidence: "high", decidedAt: "2022-10-18T12:00:00Z",
    title: "Keep TypeVar declarations as module-level assignments",
    summary: "Staying with T = TypeVar(\"T\") was rejected as verbose and confusing about scope.",
    reasons: [
      { text: "Module-level TypeVars leak into the global namespace and confuse scope.",
        quotes: [{ post: 47, quote: "module-level TypeVars leak into the namespace and confuse people about scope" }] },
      { text: "The name has to be written twice.",
        quotes: [{ post: 47, quote: "writing the name twice is pure boilerplate" }] },
    ],
    anchors: [anchor("Lib/typing.py", "TypeVar", "symbol_mention", 47)],
  },
  {
    id: 16, topicSlug: "pep-695", kind: "alternative", status: "rejected", confidence: "medium", decidedAt: "2022-11-21T12:00:00Z",
    title: "Require explicit in and out keywords for variance",
    summary: "Explicit variance keywords were rejected in favour of inferring variance.",
    reasons: [
      { text: "Variance can be inferred from usage, so most users never need to say it.",
        quotes: [{ post: 71, quote: "variance can be inferred from how the parameter is used" }] },
      { text: "New soft keywords add parsing complexity.",
        quotes: [{ post: 63, quote: "in and out would have to become soft keywords inside brackets" }] },
    ],
    anchors: [anchor("Objects/typevarobject.c", "typevar_new_impl", "symbol_mention", 71)],
  },
  {
    id: 17, topicSlug: "pep-695", kind: "alternative", status: "rejected", confidence: "high", decidedAt: "2022-12-05T12:00:00Z",
    title: "Prefix each parameter with a typevar keyword",
    summary: "def f[typevar T] was rejected as noisy for no gain in clarity.",
    reasons: [
      { text: "The keyword repeats information the brackets already give.",
        quotes: [{ post: 96, quote: "a typevar keyword inside the brackets would at least be explicit" }, { post: 266, quote: "a keyword prefix repeats what the brackets already say" }] },
    ],
    anchors: [],
  },
  {
    id: 18, topicSlug: "pep-695", kind: "alternative", status: "rejected", confidence: "high", decidedAt: "2023-01-16T12:00:00Z",
    title: "Evaluate type alias values eagerly",
    summary: "Eager evaluation was rejected because it breaks forward references in aliases.",
    reasons: [
      { text: "Eager evaluation breaks aliases that refer to names defined later.",
        quotes: [{ post: 120, quote: "eager evaluation breaks every alias that refers to a class defined later in the module" }] },
    ],
    anchors: [anchor("Objects/typevarobject.c", "typealias_value", "symbol_mention", 120)],
  },
  {
    id: 19, topicSlug: "pep-695", kind: "alternative", status: "withdrawn", confidence: "medium", decidedAt: "2023-02-01T12:00:00Z",
    title: "Allow default values for type parameters in this PEP",
    summary: "Defaults were moved out of this PEP into a separate proposal.",
    reasons: [
      { text: "Defaults need their own design discussion.",
        quotes: [{ post: 142, quote: "defaults deserve their own PEP, so I am taking them out of this one" }] },
    ],
    anchors: [],
  },
  {
    id: 20, topicSlug: "pep-695", kind: "alternative", status: "rejected", confidence: "medium", decidedAt: "2023-02-27T12:00:00Z",
    title: "Declare type parameters in a trailing where clause",
    summary: "A where clause after the signature was rejected as too far from where the parameters are used.",
    reasons: [
      { text: "A trailing clause separates the parameter from its first use.",
        quotes: [{ post: 205, quote: "a trailing where clause puts the declaration far away from its first use" }, { post: 177, quote: "a where clause keeps long signatures readable" }] },
    ],
    anchors: [],
  },
];

export const evalRuns: MockEvalRun[] = [
  {
    id: 1, topicSlug: "pep-698", createdAt: "2026-10-31T23:05:00Z",
    items: [
      { item: { title: "Runtime enforcement", text: "Checking overrides at runtime was rejected because of the cost and because static checkers already catch it." }, decisionId: 3, agreement: "yes" },
      { item: { title: "Making @override mandatory", text: "Requiring the decorator everywhere would break existing code; strict modes are left to type checkers." }, decisionId: 2, agreement: "partial" },
      { item: { title: "Marking base classes that require explicit overrides", text: "A class-level opt-in was considered and left to type checkers." }, decisionId: null, agreement: null },
    ],
  },
  {
    id: 2, topicSlug: "pep-701", createdAt: "2026-10-31T23:12:00Z",
    items: [
      { item: { title: "Keep the existing STRING token", text: "The single-token design cannot handle nested quotes and keeps two parsers in sync." }, decisionId: 7, agreement: "yes" },
      { item: { title: "Keep the backslash restriction", text: "The restriction was an implementation artefact." }, decisionId: 8, agreement: "yes" },
      { item: { title: "Limit nesting depth", text: "A fixed limit is arbitrary; the tokenizer limit is enough." }, decisionId: 9, agreement: "partial" },
      { item: { title: "A new raw f-string prefix", text: "Existing rf-strings cover the use case." }, decisionId: 11, agreement: "no" },
      { item: { title: "Different quote rules for triple-quoted strings", text: "Special-casing triple quotes would make the rules harder to explain." }, decisionId: null, agreement: null },
      { item: { title: "A separate tokenization pass for f-strings", text: "A second pass would recreate the two-parser problem." }, decisionId: null, agreement: null },
    ],
  },
  {
    id: 3, topicSlug: "pep-695", createdAt: "2026-10-31T23:28:00Z",
    items: [
      { item: { title: "Angle brackets", text: "Ambiguous with comparison operators." }, decisionId: 14, agreement: "yes" },
      { item: { title: "Keep TypeVar assignments", text: "Verbose and unclear about scope." }, decisionId: 15, agreement: "yes" },
      { item: { title: "Explicit variance keywords", text: "Variance is inferred instead." }, decisionId: 16, agreement: "partial" },
      { item: { title: "A typevar keyword prefix", text: "Adds noise without clarity." }, decisionId: 17, agreement: "yes" },
      { item: { title: "Eager alias evaluation", text: "Breaks forward references." }, decisionId: 18, agreement: "yes" },
      { item: { title: "A trailing where clause", text: "Separates declaration from use and complicates scoping." }, decisionId: 20, agreement: "partial" },
      { item: { title: "Type parameter defaults", text: "Deferred to a separate PEP." }, decisionId: 19, agreement: "yes" },
      { item: { title: "TypeVar as a soft keyword", text: "Would conflict with existing uses of the name." }, decisionId: null, agreement: null },
    ],
  },
];

export const prChecks: PrCheckView[] = [
  {
    id: 3,
    request: { repo: "sipmap/cpython", prNumber: 17, title: "Fix typo in Doc/whatsnew/3.14.rst" },
    decisionIds: [],
    similarRejectedIds: [],
    commentMarkdown: "<!-- dejaview -->\n**DejaView check:** no past decisions touch the files in this pull request.",
    createdAt: "2026-10-31T23:40:00Z",
  },
  {
    id: 2,
    request: { repo: "sipmap/cpython", prNumber: 15, title: "Add a raw f-string prefix for regular expressions" },
    decisionIds: [],
    similarRejectedIds: [11],
    commentMarkdown:
      "<!-- dejaview -->\n### DejaView check: this looks like a previously rejected idea\n\n**PEP 701 · Rejected: Add a separate raw f-string prefix for regular expressions**\n\nWhy: rf-strings already cover the regex use case.\n\n> Evidence is **unverified**: the quotes could not be matched to their posts. Check the thread before relying on this.\n\n[View decision](/decisions/11)",
    createdAt: "2026-10-31T23:31:00Z",
  },
  {
    id: 1,
    request: { repo: "sipmap/cpython", prNumber: 12, title: "gh-140112: Speed up typing.override by caching __override__" },
    decisionIds: [1, 3],
    similarRejectedIds: [],
    commentMarkdown:
      "<!-- dejaview -->\n### DejaView check: 2 past decisions touch this code\n\n**PEP 698 · Accepted: Add an @override decorator to typing**\n\nWhy: it costs nothing at runtime beyond setting one attribute.\n\n> \"the only runtime effect is setting __override__ = True on the function\" (lukas_w, verified)\n\n**PEP 698 · Rejected: Enforce @override at runtime**\n\nWhy: walking the MRO for every decorated method slows down class creation.\n\n> \"walking the MRO for every decorated method would slow down class creation for everyone\" (sato_k, verified)\n\nLinked via `Lib/typing.py` (`override`).\n\n[View decisions](/decisions?topic=pep-698)",
    createdAt: "2026-10-31T23:22:00Z",
  },
];
