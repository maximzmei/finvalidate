import { callClaude } from "./claude";
import { type PRFile, getPRFiles, postOrUpdateComment } from "./github";

export interface ReviewInput {
  token: string;
  apiKey: string;
  model: string;
  maxDiffTokens: number;
  owner: string;
  repo: string;
  prNumber: number;
}

export interface ReviewResult {
  violationsFound: boolean;
  criticalCount: number;
  commentUrl?: string;
}

const FINVALIDATE_COMMENT_MARKER = "<!-- finvalidate-review -->";

export async function reviewPR(input: ReviewInput): Promise<ReviewResult> {
  const files = await getPRFiles(
    input.token,
    input.owner,
    input.repo,
    input.prNumber,
  );

  const diff = formatDiff(files, input.maxDiffTokens);
  if (!diff.trim()) {
    return { violationsFound: false, criticalCount: 0 };
  }

  const response = await callClaude(input.apiKey, input.model, diff);

  const violationsFound = !response.includes(
    "No fintech rule violations detected",
  );
  const criticalCount = violationsFound
    ? (response.match(/🔴 CRITICAL/g) ?? []).length
    : 0;
  const body = formatComment(response);

  const commentUrl = await postOrUpdateComment(
    input.token,
    input.owner,
    input.repo,
    input.prNumber,
    body,
    FINVALIDATE_COMMENT_MARKER,
  );

  return { violationsFound, criticalCount, commentUrl };
}

export function formatDiff(files: PRFile[], maxTokens: number): string {
  const chunks: string[] = [];
  let approxTokens = 0;

  for (const file of files) {
    if (!file.patch) continue;
    if (file.status === "removed") continue;

    const addedLines = file.patch
      .split("\n")
      .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
      .join("\n");

    if (!addedLines) continue;

    const chunk = `### ${file.filename}\n\`\`\`diff\n${addedLines}\n\`\`\`\n`;
    approxTokens += Math.ceil(chunk.length / 4);

    if (approxTokens > maxTokens) break;
    chunks.push(chunk);
  }

  return chunks.join("\n");
}

function formatComment(review: string): string {
  return [
    FINVALIDATE_COMMENT_MARKER,
    "## FinValidate Review",
    "",
    review,
    "",
    "---",
    "*Powered by [FinValidate](https://finvalidate.dev) — AI code review for TypeScript fintech*",
  ].join("\n");
}
