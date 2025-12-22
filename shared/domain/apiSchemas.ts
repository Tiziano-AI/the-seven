import { z } from "zod";
import { councilRefSchema } from "./councilRef";
import { councilMemberTuningInputSchema, councilMemberTuningSchema } from "./councilMemberTuning";
import { INGRESS_SOURCES } from "./ingress";
import { providerModelRefSchema } from "./providerModels";
import { phasePromptsSchema } from "./phasePrompts";
import { MEMBER_POSITIONS } from "./sevenMembers";
import { isSingleLine } from "./strings";

const timestampSchema = z.string().datetime();

export const successEnvelopeSchema = z.object({
  trace_id: z.string(),
  ts: timestampSchema,
  result: z.object({
    resource: z.string(),
    payload: z.unknown(),
  }),
});

export const memberSchema = z.object({
  position: z.number().int(),
  role: z.enum(["reviewer", "synthesizer"]),
  alias: z.string(),
  label: z.string(),
});

export const outputFormatsSchema = z.object({
  phase1: z.string(),
  phase2: z.string(),
  phase3: z.string(),
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
  questionHash: z.string(),
  ingressSource: z.enum(INGRESS_SOURCES),
  ingressVersion: z.string().nullable(),
  councilNameAtRun: z.string(),
  status: z.enum(["pending", "processing", "completed", "failed"]),
  failureKind: z.string().nullable(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
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
    createdAt: timestampSchema,
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
    createdAt: timestampSchema,
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
    createdAt: timestampSchema,
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
    requestStartedAt: z.number().int().nullable(),
    responseCompletedAt: z.number().int().nullable(),
    latencyMs: z.number().int().nullable(),
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
    createdAt: timestampSchema,
  });

export const sessionDetailPayloadSchema = z.object({
  session: z.object({
    id: z.number().int(),
    query: z.string(),
    questionHash: z.string(),
    ingressSource: z.enum(INGRESS_SOURCES),
    ingressVersion: z.string().nullable(),
    councilNameAtRun: z.string(),
    status: z.enum(["pending", "processing", "completed", "failed"]),
    failureKind: z.string().nullable(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
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
    questionHash: z.string(),
    ingressSource: z.enum(INGRESS_SOURCES),
    ingressVersion: z.string().nullable(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  }),
  runSpec: z.object({
    createdAt: timestampSchema,
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

const attachmentsInputSchema = z
  .array(
    z.object({
      name: z
        .string()
        .trim()
        .min(1)
        .max(200)
        .refine((value) => !/[\r\n]/.test(value), "Attachment name must be single-line"),
      base64: z.string().min(1),
    })
  )
  .optional();

const councilMembersSchema = z
  .array(
    z.object({
      memberPosition: z.number().int().min(1).max(7),
      model: providerModelRefSchema,
      tuning: councilMemberTuningInputSchema.nullable().optional(),
    })
  )
  .length(7)
  .superRefine((members, ctx) => {
    const seen = new Set<number>();
    for (const member of members) {
      if (seen.has(member.memberPosition)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["members"],
          message: `Duplicate memberPosition ${member.memberPosition}`,
        });
      }
      seen.add(member.memberPosition);
    }
    for (const required of MEMBER_POSITIONS) {
      if (!seen.has(required)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["members"],
          message: `Missing memberPosition ${required}`,
        });
      }
    }
  });

export const demoRequestBodySchema = z.object({
  email: z
    .string()
    .trim()
    .min(3)
    .max(320)
    .email()
    .refine((value) => isSingleLine(value), "Email must be single-line"),
});

export const demoConsumeBodySchema = z.object({
  token: z.string().trim().min(10),
});

export const duplicateCouncilBodySchema = z.object({
  source: councilRefSchema,
  name: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .refine((value) => !/[\r\n]/.test(value), "Council name must be single-line"),
});

export const updateCouncilBodySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .refine((value) => !/[\r\n]/.test(value), "Council name must be single-line"),
  phasePrompts: phasePromptsSchema,
  members: councilMembersSchema,
});

export const modelValidateBodySchema = z.object({
  modelId: z.string().min(1),
});

export const modelAutocompleteBodySchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(50).optional(),
});

export const querySubmitBodySchema = z.object({
  query: z.string().min(1),
  councilRef: councilRefSchema,
  attachments: attachmentsInputSchema,
});

export const queryContinueBodySchema = z.object({
  sessionId: z.number().int(),
});

export const queryRerunBodySchema = z.object({
  sessionId: z.number().int(),
  councilRef: councilRefSchema,
  queryOverride: z
    .string()
    .min(1)
    .refine((value) => value.trim().length > 0, "Query must not be blank")
    .optional(),
});

export type CouncilListItem = z.infer<typeof councilListItemSchema>;
export type CouncilDetailPayload = z.infer<typeof councilDetailPayloadSchema>;
export type SessionDetailPayload = z.infer<typeof sessionDetailPayloadSchema>;
export type SessionDiagnosticsPayload = z.infer<typeof sessionDiagnosticsPayloadSchema>;
export type SessionSummary = z.infer<typeof sessionSummarySchema>;
