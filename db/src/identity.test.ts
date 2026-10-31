// The rules for recognising the same person, and the repository that stores the answer.
//
// The pure rules need no database, so they are tested on their own. The repository tests run
// against a real Postgres, like the rest of the data layer.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { createPool as createPoolHere } from "./client.js";
import { IdentityRepository, platformForSource } from "./identity.js";
import {
  emailMatchesLogin,
  judgeMerge,
  loginFromNoreplyEmail,
  normalizeDisplayName,
  normalizeHandle,
} from "./identityResolver.js";
import { createTestDatabase, type TestDatabase } from "./testing.js";

const databaseUrl = process.env.DATABASE_URL;

describe("the rules for recognising the same person", () => {
  it("normalizes a handle so spelling does not matter", () => {
    expect(normalizeHandle("Niel.Girdhar")).toBe("nielgirdhar");
    expect(normalizeHandle("niel girdhar")).toBe("nielgirdhar");
    expect(normalizeHandle("  NeilGirdhar ")).toBe("neilgirdhar");
  });

  it("normalizes a display name", () => {
    expect(normalizeDisplayName("Neil Girdhar")).toBe("neilgirdhar");
    expect(normalizeDisplayName("neil-girdhar")).toBe("neilgirdhar");
  });

  it("does not merge two handles on the same platform", () => {
    const verdict = judgeMerge(
      { platform: "discourse", handle: "alice" },
      { platform: "discourse", handle: "alice" },
    );
    expect(verdict).toBeNull();
  });

  it("merges the same handle on two platforms, with medium confidence", () => {
    const verdict = judgeMerge(
      { platform: "discourse", handle: "alice" },
      { platform: "github", handle: "alice" },
    );
    expect(verdict?.confidence).toBeCloseTo(0.6);
    expect(verdict?.evidence).toContain("alice");
  });

  it("merges the same display name on two platforms, with medium confidence", () => {
    const verdict = judgeMerge(
      { platform: "discourse", handle: "al", displayName: "Alice Example" },
      { platform: "github", handle: "alice-code", displayName: "Alice Example" },
    );
    expect(verdict?.confidence).toBeCloseTo(0.5);
    expect(verdict?.evidence).toContain("Alice Example");
  });

  it("merges on the same email with high confidence", () => {
    const verdict = judgeMerge(
      { platform: "discourse", handle: "al", email: "a@example.com" },
      { platform: "github", handle: "alice-code", email: "a@example.com" },
    );
    expect(verdict?.confidence).toBeCloseTo(0.9);
    expect(verdict?.evidence).toContain("a@example.com");
  });

  it("reads the login out of a GitHub noreply email", () => {
    expect(loginFromNoreplyEmail("12345+alice@users.noreply.github.com")).toBe("alice");
    expect(loginFromNoreplyEmail("alice@example.com")).toBeNull();
    expect(emailMatchesLogin("12345+alice@users.noreply.github.com", "alice")).toBe(true);
    expect(emailMatchesLogin("12345+bob@users.noreply.github.com", "alice")).toBe(false);
  });

  it("says nothing when there is no evidence at all", () => {
    const verdict = judgeMerge(
      { platform: "discourse", handle: "alice" },
      { platform: "github", handle: "bob" },
    );
    expect(verdict).toBeNull();
  });

  it("knows which platform a source belongs to", () => {
    expect(platformForSource("discourse")).toBe("discourse");
    expect(platformForSource("github_issue")).toBe("github");
    expect(platformForSource("github_pr")).toBe("github");
    expect(platformForSource("upload")).toBe("unknown");
  });
});

describe.skipIf(!databaseUrl)("the identity repository (needs DATABASE_URL)", () => {
  let pool: Pool;
  let database: TestDatabase;
  let identities: IdentityRepository;

  beforeAll(async () => {
    database = await createTestDatabase(databaseUrl ?? "", "dejaview_test_identity");
    pool = database.pool;
    identities = new IdentityRepository(pool);
    await cleanUp();
  });

  afterAll(async () => {
    await cleanUp();
    await database.drop();
  });

  async function cleanUp(): Promise<void> {
    await pool.query("DELETE FROM identities");
    await pool.query("DELETE FROM people");
  }

  it("remembers a handle and gives it a person", async () => {
    const result = await identities.remember({
      platform: "discourse",
      handle: "alice",
      displayName: "Alice Example",
    });
    expect(result.merged).toBe(false);
    expect(result.personId).toBeGreaterThan(0);

    const found = await identities.findByHandle("discourse", "alice");
    expect(found?.displayName).toBe("Alice Example");
    expect(found?.confidence).toBe(1);
  });

  it("does not create the same handle twice", async () => {
    const first = await identities.remember({ platform: "discourse", handle: "alice" });
    const second = await identities.remember({ platform: "discourse", handle: "alice" });
    expect(second.identityId).toBe(first.identityId);
    expect(second.merged).toBe(false);
  });

  it("links the same handle on another platform to the same person", async () => {
    const first = await identities.remember({
      platform: "discourse",
      handle: "alice",
      displayName: "Alice Example",
    });
    const second = await identities.remember({
      platform: "github",
      handle: "alice",
      displayName: "Alice Example",
    });

    expect(second.merged).toBe(true);
    expect(second.personId).toBe(first.personId);
    expect(second.evidence).toContain("alice");

    const people = await identities.people();
    const alice = people.find((person) => person.personId === first.personId);
    expect(alice?.identities).toHaveLength(2);
    expect(alice?.identities.map((identity) => identity.platform).sort()).toEqual([
      "discourse",
      "github",
    ]);
  });

  it("keeps the confidence and the evidence of a merge", async () => {
    await identities.remember({ platform: "discourse", handle: "bob", displayName: "Bob Example" });
    const merged = await identities.remember({
      platform: "github",
      handle: "bob",
      displayName: "Bob Example",
    });

    const found = await identities.findByHandle("github", "bob");
    expect(found?.confidence).toBeCloseTo(0.6);
    expect(found?.evidence).toContain("the same handle");
  });

  it("keeps two different people apart", async () => {
    await identities.remember({ platform: "discourse", handle: "carol" });
    const other = await identities.remember({ platform: "github", handle: "dave" });

    expect(other.merged).toBe(false);
    const people = await identities.people();
    expect(people.length).toBeGreaterThanOrEqual(2);
  });

  it("counts how many identities were linked to somebody we already knew", async () => {
    await identities.remember({ platform: "discourse", handle: "erin" });
    await identities.remember({ platform: "github", handle: "erin" });
    expect(await identities.mergedCount()).toBeGreaterThan(0);
  });
});
