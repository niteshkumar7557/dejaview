import { runAction } from "./action.js";

runAction().then((result) => {
  console.log(`DejaView comment ${result.comment} for ${result.request.repo}#${result.request.prNumber}`);
}).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Action failed";
  console.error(`DejaView Action failed: ${message}`);
  process.exitCode = 1;
});
