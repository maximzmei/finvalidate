import { Octokit } from '@octokit/rest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface EphemeralPR {
  prNumber: number;
  branchName: string;
  eventPath: string;
}

export interface EphemeralPRWithConfig extends EphemeralPR {
  baseBranchName: string;
}

export async function createEphemeralPR(
  token: string,
  owner: string,
  repo: string,
  fixtureName: string = 'bad-payment.ts',
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

  // Derive destination path and PR title from fixtureName
  const destPath = `src/${fixtureName}`;
  const fixtureStem = fixtureName.replace(/\.ts$/, '');
  const prTitle = `[E2E Test] ${fixtureStem} — will be closed automatically`;

  // Commit fixture file to test branch
  const fixturePath = path.resolve(__dirname, 'fixtures', fixtureName);
  const fixtureContent = fs.readFileSync(fixturePath, 'utf-8');
  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: destPath,
    message: 'test: add file with FIN-001 violation',
    content: Buffer.from(fixtureContent).toString('base64'),
    branch: branchName,
  });

  // Open PR
  const { data: pr } = await octokit.pulls.create({
    owner,
    repo,
    title: prTitle,
    head: branchName,
    base: defaultBranch,
    body: 'Automated E2E test PR.',
  });

  // Write GitHub Actions event payload for dist/index.js to consume
  const eventPayload = {
    action: 'opened',
    pull_request: {
      number: pr.number,
      base: { sha: pr.base.sha },
    },
    repository: { name: repo, owner: { login: owner } },
  };
  const eventPath = path.join(os.tmpdir(), `finvalidate-pr-event-${Date.now()}.json`);
  fs.writeFileSync(eventPath, JSON.stringify(eventPayload, null, 2));

  return { prNumber: pr.number, branchName, eventPath };
}

export async function createEphemeralPRWithConfig(
  token: string,
  owner: string,
  repo: string,
  configYaml: string,
  fixtureName: string = 'bad-payment.ts',
): Promise<EphemeralPRWithConfig> {
  const octokit = new Octokit({ auth: token });
  const ts = Date.now();
  const baseBranchName = `e2e-config-base-${ts}`;
  const branchName = `e2e-config-test-${ts}`;

  const { data: repoData } = await octokit.repos.get({ owner, repo });
  const defaultBranch = repoData.default_branch;
  const { data: refData } = await octokit.git.getRef({
    owner,
    repo,
    ref: `heads/${defaultBranch}`,
  });
  const masterSha = refData.object.sha;

  // Create config-base branch from master and add .finvalidate.yml to it
  await octokit.git.createRef({ owner, repo, ref: `refs/heads/${baseBranchName}`, sha: masterSha });
  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: '.finvalidate.yml',
    message: 'chore: add .finvalidate.yml for E2E config test',
    content: Buffer.from(configYaml).toString('base64'),
    branch: baseBranchName,
  });

  // Get updated SHA of config-base (after the .finvalidate.yml commit)
  const { data: configBaseRef } = await octokit.git.getRef({
    owner,
    repo,
    ref: `heads/${baseBranchName}`,
  });
  const configBaseSha = configBaseRef.object.sha;

  // Create test branch from config-base and commit fixture
  await octokit.git.createRef({ owner, repo, ref: `refs/heads/${branchName}`, sha: configBaseSha });
  const fixtureStem = fixtureName.replace(/\.ts$/, '');
  const fixturePath = path.resolve(__dirname, 'fixtures', fixtureName);
  const fixtureContent = fs.readFileSync(fixturePath, 'utf-8');
  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: `src/${fixtureName}`,
    message: `test: add ${fixtureName} with fintech violation`,
    content: Buffer.from(fixtureContent).toString('base64'),
    branch: branchName,
  });

  // Open PR against config-base (not master) so loadRepoConfig reads .finvalidate.yml from base sha
  const { data: pr } = await octokit.pulls.create({
    owner,
    repo,
    title: `[E2E Config Test] ${fixtureStem} — will be closed automatically`,
    head: branchName,
    base: baseBranchName,
    body: 'Automated E2E config test PR.',
  });

  const eventPayload = {
    action: 'opened',
    pull_request: { number: pr.number, base: { sha: pr.base.sha } },
    repository: { name: repo, owner: { login: owner } },
  };
  const eventPath = path.join(os.tmpdir(), `finvalidate-config-pr-event-${ts}.json`);
  fs.writeFileSync(eventPath, JSON.stringify(eventPayload, null, 2));

  return { prNumber: pr.number, branchName, baseBranchName, eventPath };
}

export async function cleanupPRWithConfig(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  branchName: string,
  baseBranchName: string,
  eventPath: string,
): Promise<void> {
  const octokit = new Octokit({ auth: token });

  try {
    await octokit.pulls.update({ owner, repo, pull_number: prNumber, state: 'closed' });
  } catch (e) {
    console.error('cleanupPRWithConfig: failed to close PR', e);
  }
  try {
    await octokit.git.deleteRef({ owner, repo, ref: `heads/${branchName}` });
  } catch (e) {
    console.error('cleanupPRWithConfig: failed to delete test branch', e);
  }
  try {
    await octokit.git.deleteRef({ owner, repo, ref: `heads/${baseBranchName}` });
  } catch (e) {
    console.error('cleanupPRWithConfig: failed to delete config-base branch', e);
  }
  try {
    fs.unlinkSync(eventPath);
  } catch {
    // ignore
  }
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
