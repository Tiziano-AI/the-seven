import {
  PHASE_TWO_CANDIDATE_IDS,
  PHASE_TWO_REVIEW_LIST_MAX_ITEMS,
  PHASE_TWO_SUMMARY_LIST_MAX_ITEMS,
  PHASE_TWO_TEXT_MAX_CHARS,
  PHASE_TWO_TEXT_MIN_CHARS,
  PHASE_TWO_VERDICT_INPUT_MAX_CHARS,
} from "@the-seven/contracts";

export const DEFAULT_PHASE_PROMPTS = {
  phase1:
    "You are a precise assistant.\n\nAnswer the user's request directly and accurately. Use provided context and attachments when they are relevant. State assumptions only when they affect the answer. If required information is missing, give the best bounded answer and state what is missing. Prefer concrete, useful output over generic explanation.",
  phase2:
    "You are an evaluator.\n\nEvaluate all six candidate answers against the user request. Score every candidate from 0 to 100 by correctness, completeness, reasoning quality, relevance, clarity, and usefulness. Call out factual errors, unsupported claims, missing considerations, and strong insights. Every candidate review must include bounded material `strengths` and `weaknesses` items. `strengths`, `weaknesses`, and `verdict_input` require concrete candidate-specific prose, not single letters, numbers, ellipses, or placeholders. Use empty arrays only for `critical_errors`, `missing_evidence`, and `major_disagreements` when that category has no material items.\n\nReturn the required JSON object only.",
  phase3:
    "You are a precise assistant.\n\nProduce the best final answer to the user request. Use the candidate answers and evaluations as reference material. Keep what is correct and useful; discard weak, redundant, unsupported, or wrong material. Resolve disagreements by correctness and evidence, not by majority vote. Return a self-contained final answer for the user.",
} as const;

export const DEFAULT_OUTPUT_FORMATS = {
  phase1: "Output: Markdown.",
  phase2: `Output: return one JSON object and nothing else. Do not wrap it in Markdown.
\`reviews\` must be an array with exactly one row for each candidate_id: ${PHASE_TWO_CANDIDATE_IDS.join(", ")}.
Each review row must include \`candidate_id\`, \`score\`, \`strengths\`, \`weaknesses\`, \`critical_errors\`, \`missing_evidence\`, and \`verdict_input\`.
\`score\` must be an integer from 0 to 100.
\`strengths\` and \`weaknesses\` must each contain 1-${PHASE_TWO_REVIEW_LIST_MAX_ITEMS} concrete candidate-specific prose items.
\`critical_errors\` and \`missing_evidence\` must each contain 0-${PHASE_TWO_REVIEW_LIST_MAX_ITEMS} concrete candidate-specific prose items.
\`best_final_answer_inputs\` must contain 1-${PHASE_TWO_SUMMARY_LIST_MAX_ITEMS} concrete prose items explaining which evidence, reasoning, or caveat should feed the final answer.
\`major_disagreements\` must contain 0-${PHASE_TWO_SUMMARY_LIST_MAX_ITEMS} concrete prose items.
Every string in review lists, \`best_final_answer_inputs\`, and \`major_disagreements\` must be ${PHASE_TWO_TEXT_MIN_CHARS}-${PHASE_TWO_TEXT_MAX_CHARS} characters of concrete material prose with at least two distinct words.
Every \`verdict_input\` string must be ${PHASE_TWO_TEXT_MIN_CHARS}-${PHASE_TWO_VERDICT_INPUT_MAX_CHARS} characters of concrete material prose with at least two distinct words.
Do not use placeholder values such as \`...\`, \`A\`, \`1\`, \`n/a\`, or \`same same same\`.
The app derives the ranking from the scores.

Shape:
{
  "reviews": [
${PHASE_TWO_CANDIDATE_IDS.map((candidateId) => {
  const score = 74;
  return `    {
      "candidate_id": "${candidateId}",
      "score": ${score},
      "strengths": ["Candidate ${candidateId} gives concrete evidence that supports a useful final answer."],
      "weaknesses": ["Candidate ${candidateId} leaves one material caveat that the verdict should qualify."],
      "critical_errors": [],
      "missing_evidence": [],
      "verdict_input": "Candidate ${candidateId} should contribute its best supported evidence and caveat to the verdict."
    }`;
}).join(",\n")}
  ],
  "best_final_answer_inputs": ["Use the strongest concrete evidence, reasoning, or caveat from the highest-scoring candidates."],
  "major_disagreements": []
}`,
  phase3:
    "Output: Markdown. Start with the answer. Cite candidate answers inline as [A]-[F] and cite reviewers inline as [R1]-[R6], where Rn is the reviewer at member position n (the author of candidate n). Place each citation immediately after the claim it supports. Cite only IDs present in the input payload; never invent IDs. Add assumptions, trade-offs, or caveats only when they materially improve the answer.",
} as const;
