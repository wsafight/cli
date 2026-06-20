# Tako Quota CLI Design

## Goal

Add a script-friendly `tako quota` command that reads the configured Tako official provider and prints current quota information as JSON.

## Scope

- Add only one public command: `tako quota`.
- Output is always JSON on stdout.
- Successful output includes the 5-hour window as `fiveHour`, plus `daily` and `weekly` when available.
- Error output is also JSON and the process exits non-zero.
- The command must not print API keys, tokens, or full API IDs.

## Provider Selection

The command uses the configured Tako official provider:

1. Prefer the first provider with `type === "tako"` from `config.providers`.
2. Fall back to the legacy top-level `apiKey` / `apiId` fields if no provider exists.
3. Report `missing_tako_provider` if neither source provides usable Tako credentials.

## Query Flow

Use option 3 from the approved design:

1. Query quota with the saved `apiId`.
2. If that fails and an `apiKey` is available, call the existing key validation endpoint to resolve a fresh `apiId`.
3. Retry quota with the fresh `apiId`.
4. Return the retry result without writing the fresh `apiId` back to config.

This handles stale saved API IDs while avoiding an extra network request in the normal case.

## JSON Shape

Success:

```json
{
  "provider": "tako",
  "status": "ok",
  "fiveHour": {
    "used": 23.617805056,
    "limit": 36,
    "usedPct": 66,
    "remaining": 12.382194944,
    "remainingPct": 34,
    "windowMinutes": 300
  },
  "daily": {
    "used": 55.440940801,
    "limit": 120,
    "usedPct": 46,
    "remaining": 64.559059199,
    "remainingPct": 54
  },
  "weekly": {
    "used": 191.3715248456,
    "limit": 400,
    "usedPct": 48,
    "remaining": 208.6284751544,
    "remainingPct": 52
  },
  "fetchedAt": "2026-06-19T05:29:21.839Z"
}
```

Error:

```json
{
  "provider": "tako",
  "status": "error",
  "error": "missing_tako_provider",
  "message": "Tako provider is not configured"
}
```

## Tests

Cover:

- Successful 5-hour JSON formatting from `primary`.
- Stale `apiId` retry via `apiKey`.
- Missing Tako configuration returns JSON error and non-zero command result.
