import { Octokit } from '@octokit/rest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface EphemeralPR {
  prNumber: number;
  branchName: string;
  eventPath: string;
}

export async function createEphemeralPR(
  token: string,
  owner: string,
  repo: string,
): Promise<EphemeralPR> {
  const octokit = new Octokit({ auth: token });
  const branchName = `e2e-test-${Date.now()}`;

  // Get default branch SHA — sandbox repo must have at least one commit
  const { data: repoData } = await octokit.repos.get({ owner, repo });
  const defaultBranch = repoData.default_branch;
  const { data: refData } = await octokit.git.getRef({
    owner,
    repo,
    ref: `heads/${defaultBranch}`,
  });
  const sha = refData.object.sha;

  // Create test branch
  await octokit.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branchName}`,
    sha,
  });

  // Commit fixture file to test branch
  const fixturePath = path.resolve(__dirname, 'fixtures', 'bad-payment.ts');
  const fixtureContent = fs.readFileSync(fixturePath, 'utf-8');
  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: 'src/bad-payment.ts',
    message: 'test: add file with FIN-001 violation',
    content: Buffer.from(fixtureContent).toString('base64'),
    branch: branchName,
  });

  // Open PR
  const { data: pr } = await octokit.pulls.create({
    owner,
    repo,
    title: '[E2E Test] FIN-001 violation — will be closed automatically',
    head: branchName,
    base: defaultBranch,
    body: 'Automated E2E test PR.',
  });

  // Write GitHub Actions event payload for dist/index.js to consume
  const eventPayload = {
    action: 'opened',
    pull_request: { number: pr.number },
    repository: { name: repo, owner: { login: owner } },
  };
  const eventPath = path.join(os.tmpdir(), `finvalidate-pr-event-${Date.now()}.json`);
  fs.writeFileSync(eventPath, JSON.stringify(eventPayload, null, 2));

  return { prNumber: pr.number, branchName, eventPath };
}

export async function cleanupPR(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  branchName: string,
  eventPath: string,
): Promise<void> {
  const octokit = new Octokit({ auth: token });

  try {
    await octokit.pulls.update({ owner, repo, pull_number: prNumber, state: 'closed' });
  } catch (e) {
    console.error('cleanupPR: failed to close PR', e);
  }

  try {
    await octokit.git.deleteRef({ owner, repo, ref: `heads/${branchName}` });
  } catch (e) {
    console.error('cleanupPR: failed to delete branch', e);
  }

  try {
    fs.unlinkSync(eventPath);
  } catch {
    // ignore — file may not exist
  }
}
