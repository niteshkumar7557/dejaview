import { describe, expect, it } from "vitest";
import { errorMessage } from "./errors";
import { ApiRequestError } from "./http-source";

describe("errorMessage", () => {
  it("shows the API's own message", () => expect(errorMessage(new ApiRequestError(400, "Unsupported link"))).toBe("Unsupported link"));
  it("explains an unreachable server", () => {
    expect(errorMessage(new ApiRequestError(0, "x"))).toBe("Couldn't reach the DejaView API. Check that it is running, then try again.");
  });
  it("falls back for anything else", () => expect(errorMessage("boom")).toBe("Something went wrong. Try again."));
});
