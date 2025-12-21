/**
 * HTTP request body size limit for JSON ingress.
 *
 * This is an operational safety bound (memory / DOS posture).
 */
export const MAX_HTTP_JSON_BYTES = 32 * 1024 * 1024;
