import { z } from "zod";
import { attachmentUploadSchema, MAX_ATTACHMENT_COUNT } from "../domain/attachments";
import { councilDefinitionSchema } from "../domain/councilDefinition";
import { councilRefSchema } from "../domain/councilRef";
import { INGRESS_SOURCES } from "../domain/ingress";
import { outputFormatsSchema } from "../domain/phasePrompts";
import { BILLING_LOOKUP_STATUSES } from "../domain/providerDiagnostics";
import { sessionSnapshotSchema } from "../domain/sessionSnapshot";
import { memberPositionSchema } from "../domain/sevenMembers";

const timestampSchema = z.string().datetime();

export const validateKeyPayloadSchema = z
  .object({
    valid: z.literal(true),
  })
  .strict();

export const demoRequestBodySchema = z
  .object({
    email: z.string().trim().email(),
  })
  .strict();

export const demoRequestPayloadSchema = z
  .object({
    email: z.string().trim().email(),
  })
  .strict();

export const demoSessionPayloadSchema = z
  .object({
    email: z.string().email(),
    expiresAt: z.number().int(),
  })
  .strict();

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
  ...councilDefinitionSchema.shape,
  outputFormats: outputFormatsSchema,
  editable: z.boolean(),
  deletable: z.boolean(),
});

export const outputFormatsPayloadSchema = z.object({
  outputFormats: outputFormatsSchema,
});

export const duplicateCouncilBodySchema = z
  .object({
    source: councilRefSchema,
    name: z.string().trim().min(1).max(120),
  })
  .strict();

export const duplicateCouncilPayloadSchema = z.object({
  councilId: z.number().int().positive(),
});

export const updateCouncilBodySchema = z
  .object({
    ...councilDefinitionSchema.shape,
  })
  .strict();

export const successFlagPayloadSchema = z
  .object({
    success: z.literal(true),
  })
  .strict();

export const modelValidateBodySchema = z
  .object({
    modelId: z.string().trim().min(1),
  })
  .strict();

export const openRouterModelDetailsSchema = z.object({
  modelId: z.string(),
  modelName: z.string(),
  description: z.string(),
  contextLength: z.number().int().nullable(),
  maxCompletionTokens: z.number().int().nullable(),
  expirationDate: z.string().nullable(),
  supportedParameters: z.array(z.string()),
  inputModalities: z.array(z.string()),
  outputModalities: z.array(z.string()),
});

export const modelValidatePayloadSchema = z.object({
  valid: z.boolean(),
  model: openRouterModelDetailsSchema.nullable(),
});

export const modelAutocompleteBodySchema = z
  .object({
    query: z.string().trim().min(1),
    limit: z.number().int().positive().max(20).optional(),
  })
  .strict();

export const modelAutocompletePayloadSchema = z.object({
  suggestions: z.array(
    z.object({
      modelId: z.string(),
      modelName: z.string(),
      description: z.string(),
      contextLength: z.number().int().nullable(),
      maxCompletionTokens: z.number().int().nullable(),
      expirationDate: z.string().nullable(),
    }),
  ),
});

export const querySubmitBodySchema = z
  .object({
    query: z.string().trim().min(1),
    councilRef: councilRefSchema,
    attachments: z.array(attachmentUploadSchema).max(MAX_ATTACHMENT_COUNT).optional(),
  })
  .strict();

export const queryContinueBodySchema = z.object({}).strict();

export const queryRerunBodySchema = z
  .object({
    councilRef: councilRefSchema,
    queryOverride: z.string().trim().min(1).optional(),
  })
  .strict();

export const submitPayloadSchema = z.object({
  sessionId: z.number().int().positive(),
});

export const sessionSummarySchema = z.object({
  id: z.number().int().positive(),
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
  totalCost: z.string(),
});

export const sessionListPayloadSchema = z.array(sessionSummarySchema);

export const sessionArtifactSchema = z.object({
  id: z.number().int().positive(),
  sessionId: z.number().int().positive(),
  phase: z.number().int().min(1).max(3),
  artifactKind: z.enum(["response", "review", "synthesis"]),
  memberPosition: memberPositionSchema,
  member: z.object({
    position: memberPositionSchema,
    role: z.enum(["reviewer", "synthesizer"]),
    alias: z.string(),
    label: z.string(),
  }),
  modelId: z.string(),
  modelName: z.string(),
  content: z.string(),
  tokensUsed: z.number().int().nullable(),
  costUsdMicros: z.number().int().nullable(),
  createdAt: timestampSchema,
});

export const providerCallSchema = z.object({
  id: z.number().int().positive(),
  sessionId: z.number().int().positive(),
  phase: z.number().int().min(1).max(3),
  memberPosition: memberPositionSchema,
  requestModelId: z.string(),
  requestModelName: z.string(),
  requestMaxOutputTokens: z.number().int().nullable(),
  catalogRefreshedAt: timestampSchema.nullable(),
  supportedParameters: z.array(z.string()),
  sentParameters: z.array(z.string()),
  sentReasoningEffort: z.string().nullable(),
  sentProviderRequireParameters: z.boolean(),
  sentProviderIgnoredProviders: z.array(z.string()),
  deniedParameters: z.array(z.string()),
  responseModel: z.string().nullable(),
  billedModelId: z.string().nullable(),
  requestSystemChars: z.number().int(),
  requestUserChars: z.number().int(),
  requestTotalChars: z.number().int(),
  requestStartedAt: z.number().int().nullable(),
  responseCompletedAt: z.number().int().nullable(),
  latencyMs: z.number().int().nullable(),
  totalCostUsdMicros: z.number().int().nullable(),
  usagePromptTokens: z.number().int().nullable(),
  usageCompletionTokens: z.number().int().nullable(),
  usageTotalTokens: z.number().int().nullable(),
  finishReason: z.string().nullable(),
  nativeFinishReason: z.string().nullable(),
  errorMessage: z.string().nullable(),
  choiceErrorMessage: z.string().nullable(),
  choiceErrorCode: z.number().int().nullable(),
  errorStatus: z.number().int().nullable(),
  errorCode: z.string().nullable(),
  billingLookupStatus: z.enum(BILLING_LOOKUP_STATUSES),
  responseId: z.string().nullable(),
  createdAt: timestampSchema,
});

export const sessionDetailPayloadSchema = z.object({
  session: sessionSummarySchema.extend({
    snapshot: sessionSnapshotSchema,
  }),
  artifacts: z.array(sessionArtifactSchema),
  providerCalls: z.array(providerCallSchema),
});

export const sessionDiagnosticsPayloadSchema = z.object({
  session: sessionSummarySchema.extend({
    snapshot: sessionSnapshotSchema,
  }),
  providerCalls: z.array(providerCallSchema),
});

export type DemoSessionPayload = z.infer<typeof demoSessionPayloadSchema>;

export const exportSessionsBodySchema = z
  .object({
    sessionIds: z.array(z.number().int().positive()).min(1),
  })
  .strict();

export const exportSessionsPayloadSchema = z.object({
  markdown: z.string(),
  json: z.string(),
});
