import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Octokit } from '@octokit/rest';
import { createStubServer } from './stub-server';
import { createEphemeralPR, cleanupPR, EphemeralPR } from './github-helper';

const TOKEN = process.env.E2E_GITHUB_TOKEN ?? '';
const OWNER = process.env.E2E_REPO_OWNER ?? '';
const REPO = process.env.E2E_REPO_NAME ?? '';
const STUB_PORT = 3001;
const DIST_PATH = path.join(process.cwd(), 'dist', 'index.js');

describe('FinValidate E2E', () => {
  const stub = createStubServer(STUB_PORT);
  let pr: EphemeralPR;

  beforeAll(async () => {
    if (!TOKEN || !OWNER || !REPO) {
      throw new Error(
        'Missing required env vars: E2E_GITHUB_TOKEN, E2E_REPO_OWNER, E2E_REPO_NAME',
      );
    }
    if (!fs.existsSync(DIST_PATH)) {
      throw new Error(`dist/index.js not found at ${DIST_PATH} — run: npm run build`);
    }

    await stub.start();
    pr = await createEphemeralPR(TOKEN, OWNER, REPO);
  });

  afterAll(async () => {
    if (pr) await cleanupPR(TOKEN, OWNER, REPO, pr.prNumber, pr.branchName);
    await stub.stop();
  });

  it('finds FIN-001 violation and posts comment to PR', async () => {
    // Run dist/index.js as a child process — same as GitHub Actions runner would
    const result = spawnSync('node', [DIST_PATH], {
      env: {
        ...process.env,
        // GitHub Actions inputs (core.getInput reads INPUT_<NAME_UPPERCASED>)
        'INPUT_GITHUB-TOKEN': TOKEN,
        'INPUT_ANTHROPIC-API-KEY': 'fake-key-stub-only',
        INPUT_MODEL: 'claude-sonnet-4-6',
        'INPUT_MAX-DIFF-TOKENS': '6000',
        'INPUT_FAIL-ON-CRITICAL': 'false',
        // Redirect Anthropic SDK to our stub
        ANTHROPIC_BASE_URL: `http://localhost:${STUB_PORT}`,
        // GitHub Actions context
        GITHUB_REPOSITORY: `${OWNER}/${REPO}`,
        GITHUB_EVENT_NAME: 'pull_request',
        GITHUB_EVENT_PATH: pr.eventPath,
      },
      encoding: 'utf-8',
      timeout: 20000,
    });

    if (result.status !== 0) {
      throw new Error(
        `dist/index.js exited with code ${result.status}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
      );
    }

    // Assertion 1: Action reached the Claude stub
    expect(stub.lastRequest, 'Action never called Claude stub — check ANTHROPIC_BASE_URL').not.toBeNull();

    // Assertion 2: System prompt contains fintech rules
    expect(stub.lastRequest!.system).toContain('FIN-001');

    // Assertion 3: Diff sent to Claude includes the fixture file name
    expect(stub.lastRequest!.messages[0].content).toContain('bad-payment.ts');

    // Assertions 4 & 5: GitHub PR has FinValidate comment with violation
    const octokit = new Octokit({ auth: TOKEN });
    const { data: comments } = await octokit.issues.listComments({
      owner: OWNER,
      repo: REPO,
      issue_number: pr.prNumber,
    });

    const finvalidateComment = comments.find(c =>
      c.body?.includes('<!-- finvalidate-review -->'),
    );

    // Assertion 4: Comment was posted
    expect(
      finvalidateComment,
      `No FinValidate comment on PR #${pr.prNumber} in ${OWNER}/${REPO}`,
    ).toBeDefined();

    // Assertion 5: Comment body contains the violation
    expect(finvalidateComment!.body).toContain('🔴 CRITICAL');
  });
});
