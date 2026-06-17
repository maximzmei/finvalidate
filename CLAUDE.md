# FinValidate

GitHub Action: AI code reviewer for TypeScript/Node.js fintech.

## Spec-Driven Development

- Before implementing any module, re-read the corresponding section in `specs/mvp-technical-spec.md`
- Each test must have a comment referencing the spec assertion it validates:
  `// spec: formatDiff — drops lines starting with '-' and '+++'`
- No behavior beyond what the spec defines (YAGNI)
- Implementation order: `src/rules/fintech.ts` → `src/claude.ts` → `src/github.ts` → `src/review.ts` → `src/index.ts`
- Never modify `specs/mvp-technical-spec.md` during implementation — it is the source of truth
- If the spec is ambiguous, ask before implementing

## Fintech Domain Rules

- Never use `number` or `float` for monetary values — use `string` with decimal library or `bigint`
- Never suggest `Math.round()` on money — causes floating-point errors
- Idempotency keys must be deterministic (e.g. `${owner}/${repo}/pr/${prNumber}`)
- All external API calls (GitHub, Claude) must have explicit error handling with typed errors
- No `console.log` with financial data or tokens — use `core.debug()` from `@actions/core`
