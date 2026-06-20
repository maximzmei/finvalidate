import * as core from "@actions/core";
import { Octokit } from "@octokit/rest";
import { parse } from "yaml";

export interface RepoConfig {
  failOnCritical: boolean | undefined;
  disable: string[];
  severity: Record<string, "critical" | "warning">;
}

export const DEFAULT_CONFIG: RepoConfig = {
  failOnCritical: undefined,
  disable: [],
  severity: {},
};

const VALID_SEVERITIES = new Set(["critical", "warning"]);
const RULE_ID_PATTERN = /^FIN-\d+$/;

export async function loadRepoConfig(
  token: string,
  owner: string,
  repo: string,
  baseSha: string,
): Promise<RepoConfig> {
  const octokit = new Octokit({ auth: token });

  let raw: string;
  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path: ".finvalidate.yml",
      ref: baseSha,
    });
    if (Array.isArray(data) || data.type !== "file") {
      return DEFAULT_CONFIG;
    }
    if (data.encoding !== "base64" || !data.content) {
      core.warning(
        ".finvalidate.yml could not be read (unexpected encoding) — using defaults",
      );
      return DEFAULT_CONFIG;
    }
    raw = Buffer.from(data.content, "base64").toString("utf-8");
  } catch (err: unknown) {
    if (isNotFoundError(err)) return DEFAULT_CONFIG;
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = parse(raw);
  } catch {
    core.warning("Invalid .finvalidate.yml — using defaults");
    return DEFAULT_CONFIG;
  }

  return extractConfig(parsed);
}

function extractConfig(parsed: unknown): RepoConfig {
  if (!parsed || typeof parsed !== "object") return { ...DEFAULT_CONFIG };
  const obj = parsed as Record<string, unknown>;
  const config: RepoConfig = {
    failOnCritical: undefined,
    disable: [],
    severity: {},
  };

  const behavior = obj.behavior;
  if (behavior && typeof behavior === "object") {
    const b = behavior as Record<string, unknown>;
    if (typeof b["fail-on-critical"] === "boolean") {
      config.failOnCritical = b["fail-on-critical"];
    }
  }

  const rules = obj.rules;
  if (rules && typeof rules === "object") {
    const r = rules as Record<string, unknown>;

    if (Array.isArray(r.disable)) {
      for (const id of r.disable) {
        if (typeof id === "string" && RULE_ID_PATTERN.test(id)) {
          config.disable.push(id);
        } else {
          core.warning(
            `Unknown rule ID "${id}" in .finvalidate.yml — skipping`,
          );
        }
      }
    }

    if (r.severity && typeof r.severity === "object") {
      for (const [ruleId, value] of Object.entries(
        r.severity as Record<string, unknown>,
      )) {
        if (!RULE_ID_PATTERN.test(ruleId)) {
          core.warning(
            `Unknown rule ID "${ruleId}" in severity overrides — skipping`,
          );
          continue;
        }
        if (typeof value === "string" && VALID_SEVERITIES.has(value)) {
          config.severity[ruleId] = value as "critical" | "warning";
        } else {
          core.warning(
            `Invalid severity "${value}" for ${ruleId} — must be "critical" or "warning", skipping`,
          );
        }
      }
    }
  }

  return config;
}

function isNotFoundError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    (err as { status: number }).status === 404
  );
}
