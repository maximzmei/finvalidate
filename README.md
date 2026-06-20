# FinValidate

> AI code reviewer for TypeScript/Node.js fintech — catches decimal bugs, idempotency issues, and PCI-DSS violations before merge.

[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-FinValidate-blue?logo=github)](https://github.com/marketplace/actions/finvalidate)

## What it catches

29 fintech-specific rules across 7 categories, grounded in real production incidents:

| Category | Example violations |
|----------|-------------------|
| Decimal arithmetic | `price * quantity` with `number` type (FIN-001) |
| Rounding | `Math.round()` on monetary value (FIN-002) |
| Idempotency | POST /payments without idempotency key (FIN-012) |
| Audit logging | Balance update without audit log INSERT (FIN-016) |
| PCI-DSS | Card number in `logger.*()` call (FIN-019) |
| TLS | `rejectUnauthorized: false` in http agent (FIN-022) |
| DB transactions | Two account UPDATEs outside a transaction (FIN-024) |

Each violation gets a severity (`🔴 CRITICAL` or `🟡 WARNING`), the file and line, what's wrong, and a corrected code snippet.

## Quick start

**1. Add your Anthropic API key as a GitHub secret:**

Settings → Secrets and variables → Actions → New repository secret  
Name: `ANTHROPIC_API_KEY`

**2. Create `.github/workflows/finvalidate.yml` in your repo:**

```yaml
name: FinValidate

on:
  pull_request:

jobs:
  finvalidate:
    runs-on: ubuntu-latest
    steps:
      - uses: maximzmei/finvalidate@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
```

That's it. FinValidate reviews every PR automatically and posts a comment with findings.

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `github-token` | ✅ | `${{ github.token }}` | GitHub token for reading PRs and posting comments |
| `anthropic-api-key` | ✅ | — | Anthropic API key (get one at console.anthropic.com) |
| `model` | ❌ | `claude-sonnet-4-6` | Claude model to use |
| `max-diff-tokens` | ❌ | `6000` | Max diff tokens sent to Claude — controls cost |
| `fail-on-critical` | ❌ | `false` | Set to `'true'` to fail the step on CRITICAL violations |

## Outputs

| Output | Description |
|--------|-------------|
| `violations-found` | `"true"` if any violations were detected |
| `critical-count` | Number of CRITICAL violations found |
| `comment-url` | URL of the posted PR comment |

## Block merges on critical violations

```yaml
- uses: maximzmei/finvalidate@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    fail-on-critical: 'true'
```

Add a branch protection rule requiring this check to pass — merges are blocked until CRITICAL violations are resolved.

## Cost

FinValidate uses your own Anthropic API key. Cost per PR review:
- `claude-haiku-4-5-20251001` + 6000-token diff limit: ~$0.002
- `claude-sonnet-4-6` (default) + 6000-token diff limit: ~$0.02

Switch to Haiku to reduce cost: set `model: 'claude-haiku-4-5-20251001'`.

## License

MIT
