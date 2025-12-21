import { memberForPosition, parseMemberPosition, type MemberPosition } from "../../shared/domain/sevenMembers";
import type { MemberResponse, MemberReview } from "../../drizzle/schema";

function requireMemberPosition(value: number): MemberPosition {
  const parsed = parseMemberPosition(value);
  if (!parsed) {
    throw new Error(`Invalid memberPosition ${value}`);
  }
  return parsed;
}

export function buildReviewPrompt(params: {
  userMessage: string;
  responses: ReadonlyArray<MemberResponse>;
  reviewerMemberPosition: number;
}): string {
  const otherResponses = params.responses.filter(
    (response) => response.memberPosition !== params.reviewerMemberPosition
  );

  const responseBlock = otherResponses
    .map((response) => {
      const member = memberForPosition(requireMemberPosition(response.memberPosition));
      const tag = `model_${member.alias}`;
      return `<${tag}>\n${response.response}\n</${tag}>`;
    })
    .join("\n\n");

  return `You are reviewing 5 answers to the same task.

<task>
${params.userMessage}
</task>

Here are the answers:

${responseBlock}`;
}

export function buildSynthesisPrompt(params: {
  userMessage: string;
  responses: ReadonlyArray<MemberResponse>;
  reviews: ReadonlyArray<MemberReview>;
}): string {
  const phase1Answers = params.responses
    .slice()
    .sort((a, b) => a.memberPosition - b.memberPosition)
    .map((response) => {
      const slot = memberForPosition(requireMemberPosition(response.memberPosition)).alias;
      return {
        slot,
        answer: response.response,
      };
    });

  const phase2Reviews = params.reviews
    .slice()
    .sort((a, b) => a.reviewerMemberPosition - b.reviewerMemberPosition)
    .map((review) => {
      const reviewerSlot = memberForPosition(requireMemberPosition(review.reviewerMemberPosition)).alias;
      return {
        reviewer_slot: reviewerSlot,
        review: review.reviewContent,
      };
    });

  const payload = {
    schema_version: 2,
    task: params.userMessage,
    phase1_answers: phase1Answers,
    phase2_reviews: phase2Reviews,
  };

  return `Here is the synthesis input as JSON:

\`\`\`json
${JSON.stringify(payload, null, 2)}
\`\`\``;
}

