import { describe, expect, it } from "vitest";
import { parseDiscourseUrl, parseGithubUrl } from "./url.js";

describe("parseDiscourseUrl", () => {
  it("reads a topic URL with slug, id and post number", () => {
    const parsed = parseDiscourseUrl(
      "https://discuss.python.org/t/pep-701-syntactic-formalization-of-f-strings/22046/22",
    );
    expect(parsed).toEqual({
      kind: "discourse",
      baseUrl: "https://discuss.python.org",
      topicId: 22046,
      slug: "pep-701-syntactic-formalization-of-f-strings",
      postNumber: 22,
    });
  });

  it("reads a topic URL without a slug", () => {
    const parsed = parseDiscourseUrl("https://discuss.python.org/t/22046");
    expect(parsed?.topicId).toBe(22046);
    expect(parsed?.slug).toBeNull();
    expect(parsed?.postNumber).toBeNull();
  });

  it("reads a topic URL with a slug but no post number", () => {
    const parsed = parseDiscourseUrl("https://discuss.python.org/t/pep-698-a-typing-override-decorator/20839");
    expect(parsed?.topicId).toBe(20839);
    expect(parsed?.postNumber).toBeNull();
  });

  it("ignores the query string, the fragment and a .json suffix", () => {
    const parsed = parseDiscourseUrl(
      "https://discuss.python.org/t/pep-701/22046/22?u=someone#post-22",
    );
    expect(parsed?.topicId).toBe(22046);
    expect(parsed?.postNumber).toBe(22);

    const json = parseDiscourseUrl("https://discuss.python.org/t/22046.json");
    expect(json?.topicId).toBe(22046);
  });

  it("rejects anything that is not a topic URL", () => {
    expect(parseDiscourseUrl("https://github.com/python/cpython/issues/1")).toBeNull();
    expect(parseDiscourseUrl("not a url")).toBeNull();
    expect(parseDiscourseUrl("https://discuss.python.org/u/someone")).toBeNull();
  });
});

describe("parseGithubUrl", () => {
  it("reads an issue URL", () => {
    expect(parseGithubUrl("https://github.com/python/cpython/issues/81061")).toEqual({
      kind: "github",
      owner: "python",
      repo: "cpython",
      number: 81061,
      isPullRequest: false,
    });
  });

  it("reads a pull request URL", () => {
    const parsed = parseGithubUrl("https://github.com/python/cpython/pull/1");
    expect(parsed?.isPullRequest).toBe(true);
    expect(parsed?.number).toBe(1);
  });

  it("ignores a comment fragment", () => {
    const parsed = parseGithubUrl("https://github.com/python/cpython/issues/81061#issuecomment-1093823424");
    expect(parsed?.number).toBe(81061);
  });

  it("rejects other hosts and other GitHub paths", () => {
    expect(parseGithubUrl("https://gitlab.com/python/cpython/issues/1")).toBeNull();
    expect(parseGithubUrl("https://github.com/python/cpython")).toBeNull();
    expect(parseGithubUrl("https://github.com/python/cpython/wiki/PEP701")).toBeNull();
  });
});
