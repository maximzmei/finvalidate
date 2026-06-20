import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetContent = vi.hoisted(() => vi.fn());

vi.mock("@octokit/rest", () => ({
  Octokit: vi.fn().mockImplementation(() => ({
    repos: { getContent: mockGetContent },
  })),
}));

vi.mock("@actions/core");

import * as core from "@actions/core";
import { DEFAULT_CONFIG, loadRepoConfig } from "../config";

function encodeYaml(content: string) {
  return {
    data: {
      type: "file" as const,
      content: Buffer.from(content).toString("base64"),
      encoding: "base64",
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loadRepoConfig", () => {
  it("returns DEFAULT_CONFIG when .finvalidate.yml is missing (404)", async () => {
    // spec: loadRepoConfig — 404 returns DEFAULT_CONFIG, no warning
    mockGetContent.mockRejectedValue({ status: 404 });

    const result = await loadRepoConfig("token", "org", "repo", "abc123");

    expect(result).toEqual(DEFAULT_CONFIG);
    expect(core.warning).not.toHaveBeenCalled();
  });

  it("parses valid YAML into RepoConfig", async () => {
    // spec: loadRepoConfig — valid YAML maps to RepoConfig fields
    mockGetContent.mockResolvedValue(
      encodeYaml(`
behavior:
  fail-on-critical: true
rules:
  disable:
    - FIN-007
    - FIN-008
  severity:
    FIN-001: warning
`),
    );

    const result = await loadRepoConfig("token", "org", "repo", "abc123");

    expect(result.failOnCritical).toBe(true);
    expect(result.disable).toEqual(["FIN-007", "FIN-008"]);
    expect(result.severity).toEqual({ "FIN-001": "warning" });
  });

  it("returns DEFAULT_CONFIG and warns on malformed YAML", async () => {
    // spec: loadRepoConfig — malformed YAML emits warning, falls back to defaults
    mockGetContent.mockResolvedValue(encodeYaml("{ invalid: yaml: : :"));

    const result = await loadRepoConfig("token", "org", "repo", "abc123");

    expect(result).toEqual(DEFAULT_CONFIG);
    expect(core.warning).toHaveBeenCalledWith(
      "Invalid .finvalidate.yml — using defaults",
    );
  });

  it("warns and skips unknown rule IDs in disable list", async () => {
    // spec: loadRepoConfig — unknown rule ID in disable emits warning, rest still parsed
    mockGetContent.mockResolvedValue(
      encodeYaml(`
rules:
  disable:
    - FIN-007
    - CUSTOM-001
`),
    );

    const result = await loadRepoConfig("token", "org", "repo", "abc123");

    expect(result.disable).toEqual(["FIN-007"]);
    expect(core.warning).toHaveBeenCalledWith(
      'Unknown rule ID "CUSTOM-001" in .finvalidate.yml — skipping',
    );
  });

  it("warns and skips invalid severity values", async () => {
    // spec: loadRepoConfig — invalid severity emits warning, valid ones still parsed
    mockGetContent.mockResolvedValue(
      encodeYaml(`
rules:
  severity:
    FIN-001: warning
    FIN-002: info
`),
    );

    const result = await loadRepoConfig("token", "org", "repo", "abc123");

    expect(result.severity).toEqual({ "FIN-001": "warning" });
    expect(core.warning).toHaveBeenCalledWith(
      'Invalid severity "info" for FIN-002 — must be "critical" or "warning", skipping',
    );
  });

  it("warns and skips invalid rule IDs as severity keys", async () => {
    // spec: loadRepoConfig — invalid rule ID as severity key emits warning, valid ones still parsed
    mockGetContent.mockResolvedValue(
      encodeYaml(`
rules:
  severity:
    FIN-001: warning
    CUSTOM-001: critical
`),
    );

    const result = await loadRepoConfig("token", "org", "repo", "abc123");

    expect(result.severity).toEqual({ "FIN-001": "warning" });
    expect(core.warning).toHaveBeenCalledWith(
      'Unknown rule ID "CUSTOM-001" in severity overrides — skipping',
    );
  });

  it("returns DEFAULT_CONFIG when file has no recognized fields", async () => {
    // spec: loadRepoConfig — empty or unrecognized YAML returns DEFAULT_CONFIG
    mockGetContent.mockResolvedValue(encodeYaml("unknown_key: true"));

    const result = await loadRepoConfig("token", "org", "repo", "abc123");

    expect(result).toEqual(DEFAULT_CONFIG);
  });
});
