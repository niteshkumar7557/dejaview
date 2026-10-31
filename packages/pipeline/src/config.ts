// Which model does which job. Both come from the environment so the team can switch the extract
// model to the 4B on the day if the 9B is too slow (design: both models must stay genuinely used).

export function triageModel(): string {
  return process.env.TRIAGE_MODEL?.trim() || "qwen3.5:4b";
}

export function extractModel(): string {
  return process.env.EXTRACT_MODEL?.trim() || "qwen3.5:9b";
}
