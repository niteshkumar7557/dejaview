import { ApiRequestError } from "./http-source";

/** A sentence a maintainer can act on, from whatever a request threw. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) {
    return error.status === 0
      ? "Couldn't reach the DejaView API. Check that it is running, then try again."
      : error.message;
  }
  return "Something went wrong. Try again.";
}
