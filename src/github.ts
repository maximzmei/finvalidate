import { Octokit } from '@octokit/rest';

export interface PRFile {
  filename: string;
  status: string;
  patch?: string;
}

export async function getPRFiles(
  token: string, owner: string, repo: string, prNumber: number
): Promise<PRFile[]> {
  const octokit = new Octokit({ auth: token });
  const { data } = await octokit.pulls.listFiles({
    owner, repo, pull_number: prNumber, per_page: 100,
  });
  return data;
}

export async function postOrUpdateComment(
  token: string, owner: string, repo: string,
  prNumber: number, body: string, marker: string
): Promise<string> {
  const octokit = new Octokit({ auth: token });

  const { data: comments } = await octokit.issues.listComments({
    owner, repo, issue_number: prNumber,
  });

  const existing = comments.find(c => c.body?.includes(marker));

  if (existing) {
    const { data } = await octokit.issues.updateComment({
      owner, repo, comment_id: existing.id, body,
    });
    return data.html_url;
  }

  const { data } = await octokit.issues.createComment({
    owner, repo, issue_number: prNumber, body,
  });
  return data.html_url;
}
