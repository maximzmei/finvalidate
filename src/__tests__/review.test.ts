import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../github");
vi.mock("../claude");

import { callClaude } from "../claude";
import { DEFAULT_CONFIG } from "../config";
import type { RepoConfig } from "../config";
import { getPRFiles, postOrUpdateComment } from "../github";
import { formatDiff, reviewPR } from "../review";

describe("formatDiff", () => {
  it('keeps lines starting with "+"', () => {
    // spec: formatDiff — keeps additions (+lines) with file path
    const files = [
      {
        filename: "src/payment.ts",
        status: "modified",
        patch:
          "+const amount = new Decimal(price);\n unchanged\n-const old = price;",
      },
    ];
    const result = formatDiff(files, 10000);
    expect(result).toContain("+const amount = new Decimal(price);");
  });

  it('drops deletion lines starting with "-"', () => {
    // spec: formatDiff — drops deletions (-lines)
    const files = [
      {
        filename: "src/payment.ts",
        status: "modified",
        patch: "+const x = 1;\n-const old = 2;",
      },
    ];
    const result = formatDiff(files, 10000);
    expect(result).not.toContain("-const old = 2;");
  });

  it('drops "+++ b/..." git diff header lines', () => {
    // spec: formatDiff — drops +++ header lines (git diff metadata, not code)
    const files = [
      {
        filename: "src/payment.ts",
        status: "modified",
        patch: "+++ b/src/payment.ts\n+const x = 1;",
      },
    ];
    const result = formatDiff(files, 10000);
    expect(result).not.toContain("+++ b/src/payment.ts");
    expect(result).toContain("+const x = 1;");
  });

  it('skips files with status "removed"', () => {
    // spec: formatDiff — skips removed files entirely
    const files = [
      { filename: "src/old.ts", status: "removed", patch: "+still indexed" },
    ];
    const result = formatDiff(files, 10000);
    expect(result.trim()).toBe("");
  });

  it("skips files without a patch property", () => {
    // spec: formatDiff — skips files without patch (e.g. binary files)
    const files = [{ filename: "image.png", status: "modified" }];
    const result = formatDiff(files, 10000);
    expect(result.trim()).toBe("");
  });

  it("truncates output when approx token count exceeds maxDiffTokens", () => {
    // spec: formatDiff — truncates at maxDiffTokens (rough estimate: chunk.length / 4)
    // Each file has a ~400-char addition line → chunk ~450 chars → ~112 tokens
    const files = Array.from({ length: 20 }, (_, i) => ({
      filename: `src/file${i}.ts`,
      status: "modified",
      patch: `+${"x".repeat(400)}`,
    }));
    const result = formatDiff(files, 150); // fits ~1 file
    expect(result).toContain("src/file0.ts");
    expect(result).not.toContain("src/file19.ts");
  });

  it("returns empty string if no additions exist in any file", () => {
    // spec: formatDiff — returns empty string if no +lines after filtering
    const files = [
      { filename: "src/x.ts", status: "modified", patch: "-removed line" },
    ];
    const result = formatDiff(files, 10000);
    expect(result.trim()).toBe("");
  });
});

describe("reviewPR", () => {
  const baseInput = {
    token: "token",
    apiKey: "key",
    model: "model",
    maxDiffTokens: 6000,
    owner: "org",
    repo: "repo",
    prNumber: 1,
    config: DEFAULT_CONFIG,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts comment with clean signal and returns violationsFound=false", async () => {
    // spec: reviewPR — always posts comment; violationsFound=false when response has no violations
    vi.mocked(getPRFiles).mockResolvedValue([
      {
        filename: "src/payment.ts",
        status: "modified",
        patch: "+const x = new Decimal(1);",
      },
    ] as unknown as ReturnType<typeof getPRFiles>);
    vi.mocked(callClaude).mockResolvedValue(
      "✅ No fintech rule violations detected.",
    );
    vi.mocked(postOrUpdateComment).mockResolvedValue(
      "https://github.com/org/repo/pull/1#issuecomment-99",
    );

    const result = await reviewPR(baseInput);

    expect(result.violationsFound).toBe(false);
    expect(result.criticalCount).toBe(0);
    expect(postOrUpdateComment).toHaveBeenCalledOnce();
    expect(result.commentUrl).toBe(
      "https://github.com/org/repo/pull/1#issuecomment-99",
    );
  });

  it("posts comment, counts CRITICAL violations, and returns commentUrl", async () => {
    // spec: reviewPR — counts 🔴 CRITICAL occurrences, posts comment, returns result
    vi.mocked(getPRFiles).mockResolvedValue([
      {
        filename: "src/payment.ts",
        status: "modified",
        patch: "+const price = 1.1 + 2.2;",
      },
    ] as unknown as ReturnType<typeof getPRFiles>);
    vi.mocked(callClaude).mockResolvedValue(
      "**[FIN-001] CRITICAL: float arithmetic\n**[FIN-003] CRITICAL: toFixed",
    );
    vi.mocked(postOrUpdateComment).mockResolvedValue(
      "https://github.com/org/repo/pull/1#issuecomment-99",
    );

    const result = await reviewPR(baseInput);

    expect(result.violationsFound).toBe(true);
    expect(result.criticalCount).toBe(2);
    expect(result.commentUrl).toBe(
      "https://github.com/org/repo/pull/1#issuecomment-99",
    );
  });

  it("calls callClaude with prompt that omits disabled rules", async () => {
    // spec: reviewPR — disabled rules are stripped from system prompt before calling Claude
    vi.mocked(getPRFiles).mockResolvedValue([
      { filename: "src/x.ts", status: "modified", patch: "+const x = 1;" },
    ] as unknown as ReturnType<typeof getPRFiles>);
    vi.mocked(callClaude).mockResolvedValue(
      "✅ No fintech rule violations detected.",
    );
    vi.mocked(postOrUpdateComment).mockResolvedValue("https://example.com");

    const config: RepoConfig = { ...DEFAULT_CONFIG, disable: ["FIN-007"] };
    await reviewPR({ ...baseInput, config });

    const [, , , systemPrompt] = vi.mocked(callClaude).mock.calls[0];
    expect(systemPrompt).not.toContain("**FIN-007:");
    expect(systemPrompt).toContain("**FIN-001:");
  });

  it("calls callClaude with prompt that includes severity override block", async () => {
    // spec: reviewPR — severity overrides are appended to system prompt
    vi.mocked(getPRFiles).mockResolvedValue([
      { filename: "src/x.ts", status: "modified", patch: "+const x = 1;" },
    ] as unknown as ReturnType<typeof getPRFiles>);
    vi.mocked(callClaude).mockResolvedValue(
      "✅ No fintech rule violations detected.",
    );
    vi.mocked(postOrUpdateComment).mockResolvedValue("https://example.com");

    const config: RepoConfig = {
      ...DEFAULT_CONFIG,
      severity: { "FIN-001": "warning" },
    };
    await reviewPR({ ...baseInput, config });

    const [, , , systemPrompt] = vi.mocked(callClaude).mock.calls[0];
    expect(systemPrompt).toContain("## SEVERITY OVERRIDES");
    expect(systemPrompt).toContain("Treat FIN-001 as WARNING (not CRITICAL).");
  });
});
