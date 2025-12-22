import { z } from "zod";
import { BUILT_IN_COUNCIL_SLUGS } from "@shared/domain/builtInCouncils";

export const councilRefSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("built_in"),
    slug: z.enum(BUILT_IN_COUNCIL_SLUGS),
  }),
  z.object({
    kind: z.literal("user"),
    councilId: z.number().int().positive(),
  }),
]);

export const memberSchema = z.object({
  position: z.number().int(),
  role: z.enum(["reviewer", "synthesizer"]),
  alias: z.string(),
  label: z.string(),
});

export const phasePromptsSchema = z.object({
  phase1: z.string(),
  phase2: z.string(),
  phase3: z.string(),
});

export const outputFormatsSchema = z.object({
  phase1: z.string(),
  phase2: z.string(),
  phase3: z.string(),
});

export const councilMemberTuningSchema = z.object({
  temperature: z.number().nullable(),
  seed: z.number().int().nullable(),
  verbosity: z.string().nullable(),
  reasoningEffort: z.string().nullable(),
  includeReasoning: z.boolean().nullable(),
});

export const providerModelRefSchema = z.object({
  provider: z.string(),
  modelId: z.string(),
});

export const councilListItemSchema = z.object({
  ref: councilRefSchema,
  name: z.string(),
  description: z.string().nullable(),
  editable: z.boolean(),
  deletable: z.boolean(),
});

export const councilsListPayloadSchema = z.object({
  councils: z.array(councilListItemSchema),
});

export const councilDetailPayloadSchema = z.object({
  ref: councilRefSchema,
  name: z.string(),
  phasePrompts: phasePromptsSchema,
  outputFormats: outputFormatsSchema,
  members: z.array(
    z.object({
      memberPosition: z.number().int(),
      model: providerModelRefSchema,
      tuning: councilMemberTuningSchema.nullable(),
    })
  ),
  editable: z.boolean(),
  deletable: z.boolean(),
});

export const outputFormatsPayloadSchema = z.object({
  outputFormats: outputFormatsSchema,
});

export const duplicateCouncilPayloadSchema = z.object({
  councilId: z.number().int().positive(),
});

export const successPayloadSchema = z.object({
  success: z.literal(true),
});

export const openRouterModelDetailsSchema = z.object({
  modelId: z.string(),
  modelName: z.string(),
  description: z.string(),
  contextLength: z.number().int().nullable(),
  maxCompletionTokens: z.number().int().nullable(),
  supportedParameters: z.array(z.string()),
  inputModalities: z.array(z.string()),
  outputModalities: z.array(z.string()),
});

export const modelValidatePayloadSchema = z.object({
  valid: z.boolean(),
  model: openRouterModelDetailsSchema.nullable(),
});

export const modelAutocompleteSuggestionSchema = z.object({
  modelId: z.string(),
  modelName: z.string(),
  description: z.string(),
  contextLength: z.number().int().nullable(),
  maxCompletionTokens: z.number().int().nullable(),
});

export const modelAutocompletePayloadSchema = z.object({
  suggestions: z.array(modelAutocompleteSuggestionSchema),
});

export const demoRequestPayloadSchema = z.object({
  email: z.string(),
});

export const demoConsumePayloadSchema = z.object({
  email: z.string(),
  token: z.string(),
  expiresAt: z.number().int(),
});

export const validateKeyPayloadSchema = z.object({
  valid: z.boolean(),
});

export const submitPayloadSchema = z.object({
  sessionId: z.number().int(),
});

export const sessionSummarySchema = z.object({
  id: z.number().int(),
  query: z.string(),
  councilNameAtRun: z.string(),
  status: z.enum(["pending", "processing", "completed", "failed"]),
  failureKind: z.string().nullable(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
  totalTokens: z.number().int(),
  totalCostUsdMicros: z.number().int(),
  totalCostIsPartial: z.boolean(),
  totalCost: z.string().nullable(),
});

export const sessionListPayloadSchema = z.array(sessionSummarySchema);

export const responseRowSchema = z
  .object({
    id: z.number().int(),
    sessionId: z.number().int(),
    memberPosition: z.number().int(),
    modelId: z.string(),
    response: z.string(),
    createdAt: z.union([z.string(), z.date()]),
    member: memberSchema,
    modelName: z.string(),
    tokensUsed: z.number().int().nullable(),
    costUsdMicros: z.number().int().nullable(),
  });

export const reviewRowSchema = z
  .object({
    id: z.number().int(),
    sessionId: z.number().int(),
    reviewerMemberPosition: z.number().int(),
    modelId: z.string(),
    reviewContent: z.string(),
    createdAt: z.union([z.string(), z.date()]),
    reviewerMember: memberSchema,
    modelName: z.string(),
    tokensUsed: z.number().int().nullable(),
    costUsdMicros: z.number().int().nullable(),
  });

export const synthesisRowSchema = z
  .object({
    id: z.number().int(),
    sessionId: z.number().int(),
    memberPosition: z.number().int(),
    modelId: z.string(),
    synthesis: z.string(),
    createdAt: z.union([z.string(), z.date()]),
    member: memberSchema,
    modelName: z.string(),
    tokensUsed: z.number().int().nullable(),
    costUsdMicros: z.number().int().nullable(),
  });

export const openRouterCallSchema = z
  .object({
    id: z.number().int(),
    sessionId: z.number().int(),
    phase: z.number().int(),
    memberPosition: z.number().int(),
    member: memberSchema,
    requestModelId: z.string(),
    requestModelName: z.string(),
    responseModel: z.string().nullable(),
    responseModelName: z.string().nullable(),
    billedModelId: z.string().nullable(),
    billedModelName: z.string().nullable(),
    requestSystemChars: z.number().int(),
    requestUserChars: z.number().int(),
    requestTotalChars: z.number().int(),
    requestModelContextLength: z.number().int().nullable(),
    requestModelMaxCompletionTokens: z.number().int().nullable(),
    responseModelContextLength: z.number().int().nullable(),
    responseModelMaxCompletionTokens: z.number().int().nullable(),
    totalCostUsdMicros: z.number().int().nullable(),
    cacheDiscountUsdMicros: z.number().int().nullable(),
    upstreamInferenceCostUsdMicros: z.number().int().nullable(),
    nativeTokensPrompt: z.number().int().nullable(),
    nativeTokensCompletion: z.number().int().nullable(),
    nativeTokensReasoning: z.number().int().nullable(),
    numMediaPrompt: z.number().int().nullable(),
    numMediaCompletion: z.number().int().nullable(),
    numSearchResults: z.number().int().nullable(),
    usagePromptTokens: z.number().int().nullable(),
    usageCompletionTokens: z.number().int().nullable(),
    usageTotalTokens: z.number().int().nullable(),
    finishReason: z.string().nullable(),
    nativeFinishReason: z.string().nullable(),
    errorMessage: z.string().nullable(),
    choiceErrorMessage: z.string().nullable(),
    choiceErrorCode: z.number().int().nullable(),
    errorStatus: z.number().int().nullable(),
    responseId: z.string().nullable(),
    createdAt: z.union([z.string(), z.date()]),
  });

export const sessionDetailPayloadSchema = z.object({
  session: z.object({
    id: z.number().int(),
    query: z.string(),
    councilNameAtRun: z.string(),
    status: z.enum(["pending", "processing", "completed", "failed"]),
    failureKind: z.string().nullable(),
    createdAt: z.union([z.string(), z.date()]),
    updatedAt: z.union([z.string(), z.date()]),
  }),
  council: z.object({
    nameAtRun: z.string(),
    phasePrompts: phasePromptsSchema,
    members: z.array(
      z.object({
        member: memberSchema,
        model: z.object({
          provider: z.string(),
          modelId: z.string(),
          modelName: z.string(),
        }),
      })
    ),
  }),
  responses: z.array(responseRowSchema),
  reviews: z.array(reviewRowSchema),
  synthesis: synthesisRowSchema.nullable(),
  openRouterCalls: z.array(openRouterCallSchema),
});

export const sessionDiagnosticsPayloadSchema = z.object({
  session: z.object({
    id: z.number().int(),
    status: z.enum(["pending", "processing", "completed", "failed"]),
    failureKind: z.string().nullable(),
    createdAt: z.union([z.string(), z.date()]),
    updatedAt: z.union([z.string(), z.date()]),
  }),
  runSpec: z.object({
    createdAt: z.union([z.string(), z.date()]),
    userMessage: z.string(),
    outputFormats: outputFormatsSchema,
    council: z.object({
      nameAtRun: z.string(),
      phasePrompts: phasePromptsSchema,
      members: z.array(
        z.object({
          memberPosition: z.number().int(),
          model: providerModelRefSchema,
          tuning: councilMemberTuningSchema.nullable(),
        })
      ),
    }),
  }),
  attachments: z.array(z.object({ name: z.string(), text: z.string() })),
  openRouterCalls: z.array(openRouterCallSchema),
});

export type CouncilListItem = z.infer<typeof councilListItemSchema>;
export type CouncilDetailPayload = z.infer<typeof councilDetailPayloadSchema>;
export type SessionDetailPayload = z.infer<typeof sessionDetailPayloadSchema>;
export type SessionDiagnosticsPayload = z.infer<typeof sessionDiagnosticsPayloadSchema>;
export type SessionSummary = z.infer<typeof sessionSummarySchema>;
