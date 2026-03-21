import "server-only";

import { memberForPosition, type ReviewerMemberPosition } from "@the-seven/contracts";

type ResponseArtifact = Readonly<{
  memberPosition: ReviewerMemberPosition;
  content: string;
}>;

type ReviewArtifact = Readonly<{
  memberPosition: ReviewerMemberPosition;
  content: string;
}>;

export function buildReviewPrompt(input: {
  userMessage: string;
  responses: ReadonlyArray<ResponseArtifact>;
  reviewerMemberPosition: ReviewerMemberPosition;
}) {
  const responseBlock = input.responses
    .filter((response) => response.memberPosition !== input.reviewerMemberPosition)
    .map((response) => {
      const member = memberForPosition(response.memberPosition);
      return `<model_${member.alias}>\n${response.content}\n</model_${member.alias}>`;
    })
    .join("\n\n");

  return `You are reviewing 5 answers to the same task.

<task>
${input.userMessage}
</task>

Here are the answers:

${responseBlock}`;
}

export function buildSynthesisPrompt(input: {
  userMessage: string;
  responses: ReadonlyArray<ResponseArtifact>;
  reviews: ReadonlyArray<ReviewArtifact>;
}) {
  const payload = {
    schema_version: 1,
    task: input.userMessage,
    phase1_answers: input.responses
      .slice()
      .sort((left, right) => left.memberPosition - right.memberPosition)
      .map((response) => ({
        slot: memberForPosition(response.memberPosition).alias,
        answer: response.content,
      })),
    phase2_reviews: input.reviews
      .slice()
      .sort((left, right) => left.memberPosition - right.memberPosition)
      .map((review) => ({
        reviewer_slot: memberForPosition(review.memberPosition).alias,
        review: review.content,
      })),
  };

  return `Here is the synthesis input as JSON:

\`\`\`json
${JSON.stringify(payload, null, 2)}
\`\`\``;
}
