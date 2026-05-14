import { PHASE_TWO_CANDIDATE_IDS } from "@the-seven/contracts";

export const DEFAULT_PHASE_PROMPTS = {
  phase1:
    "You are a precise assistant.\n\nAnswer the user's request directly and accurately. Use provided context and attachments when they are relevant. State assumptions only when they affect the answer. If required information is missing, give the best bounded answer and state what is missing. Prefer concrete, useful output over generic explanation.",
  phase2:
    "You are an evaluator.\n\nEvaluate all six candidate answers against the user request. Score every candidate from 0 to 100 by correctness, completeness, reasoning quality, relevance, clarity, and usefulness. Call out factual errors, unsupported claims, missing considerations, and strong insights. Every candidate review must include at least one material `strengths` item and at least one material `weaknesses` item. `strengths`, `weaknesses`, and `verdict_input` require material candidate-specific prose, not labels, single letters, numbers, ellipses, or placeholders. Use empty arrays only for `critical_errors`, `missing_evidence`, and `major_disagreements` when that category has no material items.\n\nReturn the required JSON object only.",
  phase3:
    "You are a precise assistant.\n\nProduce the best final answer to the user request. Use the candidate answers and evaluations as reference material. Keep what is correct and useful; discard weak, redundant, unsupported, or wrong material. Resolve disagreements by correctness and evidence, not by majority vote. Return a self-contained final answer for the user.",
} as const;

export const DEFAULT_OUTPUT_FORMATS = {
  phase1: "Output: Markdown.",
  phase2: `Output: return one JSON object and nothing else. Do not wrap it in Markdown.
\`reviews\` must be an array with exactly one row for each candidate_id: ${PHASE_TWO_CANDIDATE_IDS.join(", ")}.
Each review row must include \`candidate_id\`, \`score\`, \`strengths\`, \`weaknesses\`, \`critical_errors\`, \`missing_evidence\`, and \`verdict_input\`.
\`score\` must be an integer from 0 to 100. \`strengths\` and \`weaknesses\` must each contain at least one material candidate-specific prose item; never return empty arrays for \`strengths\` or \`weaknesses\`. Use empty arrays only for \`critical_errors\`, \`missing_evidence\`, and \`major_disagreements\` when that category has no material items.
\`best_final_answer_inputs\` must contain material prose explaining which evidence, reasoning, or caveat should feed the final answer.
Every string in review lists, \`verdict_input\`, \`best_final_answer_inputs\`, and \`major_disagreements\` must be concrete material prose with at least two distinct words.
Do not use placeholder values such as \`...\`, \`A\`, \`1\`, \`n/a\`, \`same same same\`, or field labels as content.
The app derives the ranking from the scores.

Shape:
{
  "reviews": [
    {
      "candidate_id": "A",
      "score": 82,
      "strengths": ["Candidate A gives the most complete implementation path."],
      "weaknesses": ["Candidate A leaves one deployment risk unresolved."],
      "critical_errors": [],
      "missing_evidence": [],
      "verdict_input": "Candidate A should contribute the implementation sequence to the final answer."
    }
  ],
  "best_final_answer_inputs": ["Use the strongest concrete implementation path from Candidate A."],
  "major_disagreements": []
}`,
  phase3:
    "Output: Markdown. Start with the answer. Cite candidate answers inline as [A]-[F] and cite reviewers inline as [R1]-[R6], where Rn is the reviewer at member position n (the author of candidate n). Place each citation immediately after the claim it supports. Cite only IDs present in the input payload; never invent IDs. Add assumptions, trade-offs, or caveats only when they materially improve the answer.",
} as const;
