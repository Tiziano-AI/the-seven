# The Seven examples

These examples exercise the public `/api/v1` contract. They are cost-bearing
when pointed at a live origin with a real OpenRouter key.

## Batch CLI: ask, wait, answer, export

```bash
SEVEN_BYOK_KEY=sk-or-... \
  pnpm batch -- --file examples/batch/founding-question.jsonl \
  --base-url http://127.0.0.1:3000 \
  --wait \
  --export both
```

The answer appears at `items[].wait.finalAnswer.content`. Optional exports
appear at `items[].wait.export.markdown` and `items[].wait.export.json`.

## cURL: submit

```bash
curl -sS http://127.0.0.1:3000/api/v1/sessions \
  -H 'Authorization: Bearer sk-or-...' \
  -H 'Content-Type: application/json' \
  -H 'X-Seven-Ingress: cli' \
  --data '{
    "query": "What should we change first?",
    "councilRef": { "kind": "built_in", "slug": "founding" }
  }'
```

Expected success envelope:

```json
{
  "schema_version": 1,
  "trace_id": "trace-id",
  "ts": "2026-06-20T00:00:00.000Z",
  "result": {
    "resource": "sessions.create",
    "payload": { "sessionId": 123 }
  }
}
```

## cURL: get the answer

Poll until `payload.session.status` is `completed`:

```bash
curl -sS http://127.0.0.1:3000/api/v1/sessions/123 \
  -H 'Authorization: Bearer sk-or-...' \
  -H 'X-Seven-Ingress: cli'
```

The final answer is the single artifact with `"phase": 3` and
`"artifactKind": "synthesis"`:

```json
{
  "result": {
    "resource": "sessions.get",
    "payload": {
      "session": { "id": 123, "status": "completed" },
      "artifacts": [
        {
          "phase": 3,
          "artifactKind": "synthesis",
          "memberPosition": 7,
          "content": "Final answer text..."
        }
      ],
      "providerCalls": [],
      "terminalError": null
    }
  }
}
```

Failed sessions expose `payload.terminalError`; nonfailed sessions must expose
`terminalError: null`.

## cURL: export

```bash
curl -sS http://127.0.0.1:3000/api/v1/sessions/export \
  -H 'Authorization: Bearer sk-or-...' \
  -H 'Content-Type: application/json' \
  -H 'X-Seven-Ingress: cli' \
  --data '{ "sessionIds": [123] }'
```

Expected payload:

```json
{
  "result": {
    "resource": "sessions.export",
    "payload": {
      "markdown": "# The Seven export...",
      "json": "{\"sessions\":[...]}"
    }
  }
}
```

## cURL: run again

Run again creates a new immutable session instead of mutating the old run:

```bash
curl -sS http://127.0.0.1:3000/api/v1/sessions/123/rerun \
  -H 'Authorization: Bearer sk-or-...' \
  -H 'Content-Type: application/json' \
  -H 'X-Seven-Ingress: cli' \
  --data '{
    "councilRef": { "kind": "built_in", "slug": "founding" },
    "queryOverride": "Answer again with sharper launch-risk prioritization."
  }'
```

Expected payload:

```json
{
  "result": {
    "resource": "sessions.rerun",
    "payload": { "sessionId": 124 }
  }
}
```

Every JSON API response must carry `Cache-Control: no-store` and an `X-Trace-Id`
header matching the envelope `trace_id`.
