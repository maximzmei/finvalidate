import * as core from "@actions/core";
import { Octokit } from "@octokit/rest";

export interface PRFile {
  filename: string;
  status: string;
  patch?: string;
}

export async function getPRFiles(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<PRFile[]> {
  const octokit = new Octokit({ auth: token });
  try {
    const { data } = await octokit.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
      per_page: 100,
    });
    if (data.length === 100) {
      core.warning(
        "PR has 100+ files — only the first 100 were reviewed. Some files may have been skipped.",
      );
    }
    return data;
  } catch (err) {
    throw new Error(
      `Failed to fetch PR files for ${owner}/${repo}#${prNumber}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export async function postOrUpdateComment(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  body: string,
  marker: string,
): Promise<string> {
  const octokit = new Octokit({ auth: token });

  try {
    const { data: comments } = await octokit.issues.listComments({
      owner,
      repo,
      issue_number: prNumber,
      per_page: 100,
    });

    const existing = comments.find((c) => c.body?.includes(marker));

    if (existing) {
      const { data } = await octokit.issues.updateComment({
        owner,
        repo,
        comment_id: existing.id,
        body,
      });
      return data.html_url;
    }

    const { data } = await octokit.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body,
    });
    return data.html_url;
  } catch (err) {
    throw new Error(
      `Failed to post comment on ${owner}/${repo}#${prNumber}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
