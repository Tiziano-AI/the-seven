export const BILLING_LOOKUP_STATUSES = ["not_requested", "pending", "succeeded", "failed"] as const;

export type BillingLookupStatus = (typeof BILLING_LOOKUP_STATUSES)[number];
