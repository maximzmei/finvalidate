import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../config";
import type { RepoConfig } from "../config";
import { FINTECH_SYSTEM_PROMPT, buildSystemPrompt } from "../rules/fintech";

describe("buildSystemPrompt", () => {
  it("returns FINTECH_SYSTEM_PROMPT unchanged when config has no overrides", () => {
    // spec: buildSystemPrompt — DEFAULT_CONFIG returns base prompt unmodified
    const result = buildSystemPrompt(DEFAULT_CONFIG);
    expect(result).toBe(FINTECH_SYSTEM_PROMPT);
  });

  it("strips a disabled rule's block from the prompt", () => {
    // spec: buildSystemPrompt — disabled rule ID is removed from prompt text
    const config: RepoConfig = { ...DEFAULT_CONFIG, disable: ["FIN-007"] };

    const result = buildSystemPrompt(config);

    expect(result).not.toContain("**FIN-007:");
    expect(result).toContain("**FIN-001:"); // other rules intact
  });

  it("strips multiple disabled rules independently", () => {
    // spec: buildSystemPrompt — each rule in disable list is independently stripped
    const config: RepoConfig = {
      ...DEFAULT_CONFIG,
      disable: ["FIN-007", "FIN-008"],
    };

    const result = buildSystemPrompt(config);

    expect(result).not.toContain("**FIN-007:");
    expect(result).not.toContain("**FIN-008:");
    expect(result).toContain("**FIN-001:");
  });

  it("appends severity override block when config.severity has entries", () => {
    // spec: buildSystemPrompt — severity overrides appended as ## SEVERITY OVERRIDES block
    const config: RepoConfig = {
      ...DEFAULT_CONFIG,
      severity: { "FIN-001": "warning" },
    };

    const result = buildSystemPrompt(config);

    expect(result).toContain("## SEVERITY OVERRIDES");
    expect(result).toContain("Treat FIN-001 as WARNING (not CRITICAL).");
  });

  it("does not append override block when severity is empty", () => {
    // spec: buildSystemPrompt — no override block when severity map is empty
    const result = buildSystemPrompt(DEFAULT_CONFIG);
    expect(result).not.toContain("## SEVERITY OVERRIDES");
  });

  it("handles both disable and severity overrides together", () => {
    // spec: buildSystemPrompt — disable and severity can be combined
    const config: RepoConfig = {
      failOnCritical: undefined,
      disable: ["FIN-007"],
      severity: { "FIN-001": "warning" },
    };

    const result = buildSystemPrompt(config);

    expect(result).not.toContain("**FIN-007:");
    expect(result).toContain("## SEVERITY OVERRIDES");
    expect(result).toContain("Treat FIN-001 as WARNING (not CRITICAL).");
  });
});
