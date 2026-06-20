import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Octokit } from '@octokit/rest';
import { createEphemeralPR, cleanupPR, EphemeralPR } from './github-helper';

const TOKEN = process.env.E2E_GITHUB_TOKEN ?? '';
const OWNER = process.env.E2E_REPO_OWNER ?? '';
const REPO = process.env.E2E_REPO_NAME ?? '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? '';
const DIST_PATH = path.join(process.cwd(), 'dist', 'index.js');

describe('FinValidate Phase D — Real Claude', () => {
  let pr: EphemeralPR | undefined;

  beforeAll(async () => {
    if (!TOKEN || !OWNER || !REPO) {
      throw new Error('Missing: E2E_GITHUB_TOKEN, E2E_REPO_OWNER, E2E_REPO_NAME');
    }
    if (!ANTHROPIC_API_KEY) {
      throw new Error('Missing: ANTHROPIC_API_KEY');
    }
    if (!fs.existsSync(DIST_PATH)) {
      throw new Error(`dist/index.js not found at ${DIST_PATH} — run: npm run build`);
    }
    pr = await createEphemeralPR(TOKEN, OWNER, REPO);
  });

  afterAll(async () => {
    if (pr) await cleanupPR(TOKEN, OWNER, REPO, pr.prNumber, pr.branchName, pr.eventPath);
  });

  it('FIN-001: detects float arithmetic and suggests Decimal/bigint fix', async () => {
    const result = await new Promise<{
      status: number | null;
      stdout: string;
      stderr: string;
    }>((resolve) => {
      const proc = spawn('node', [DIST_PATH], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          'INPUT_GITHUB-TOKEN': TOKEN,
          'INPUT_ANTHROPIC-API-KEY': ANTHROPIC_API_KEY,
          INPUT_MODEL: 'claude-haiku-4-5-20251001',
          'INPUT_MAX-DIFF-TOKENS': '6000',
          'INPUT_FAIL-ON-CRITICAL': 'false',
          // NO ANTHROPIC_BASE_URL — SDK calls real api.anthropic.com
          ANTHROPIC_BASE_URL: undefined,
          GITHUB_REPOSITORY: `${OWNER}/${REPO}`,
          GITHUB_EVENT_NAME: 'pull_request',
          GITHUB_EVENT_PATH: pr!.eventPath,
        },
      });

      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
      proc.stderr.on('data', (d: Buffer) => (stderr += d.toString()));

      const timer = setTimeout(() => proc.kill('SIGTERM'), 25000);
      proc.on('close', (status) => {
        clearTimeout(timer);
        resolve({ status, stdout, stderr });
      });
    });

    if (result.status !== 0) {
      throw new Error(
        `dist/index.js exited with code ${result.status}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
      );
    }

    const octokit = new Octokit({ auth: TOKEN });
    const { data: comments } = await octokit.issues.listComments({
      owner: OWNER,
      repo: REPO,
      issue_number: pr!.prNumber,
    });

    const finvalidateComment = comments.find((c) =>
      c.body?.includes('<!-- finvalidate-review -->'),
    );

    // Comment was posted
    expect(finvalidateComment, `No FinValidate comment on PR #${pr!.prNumber} in ${OWNER}/${REPO}`).toBeDefined();

    const body = finvalidateComment!.body!;

    // Claude identified the rule
    expect(body).toContain('FIN-001');

    // Claude suggested the correct fix type
    expect(body.toLowerCase()).toMatch(/decimal|bigint/);
  });

  it('fail-on-critical: exits 1 when CRITICAL violation found', async () => {
    const result = await new Promise<{
      status: number | null;
      stdout: string;
      stderr: string;
    }>((resolve) => {
      const proc = spawn('node', [DIST_PATH], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          'INPUT_GITHUB-TOKEN': TOKEN,
          'INPUT_ANTHROPIC-API-KEY': ANTHROPIC_API_KEY,
          INPUT_MODEL: 'claude-haiku-4-5-20251001',
          'INPUT_MAX-DIFF-TOKENS': '6000',
          'INPUT_FAIL-ON-CRITICAL': 'true',
          ANTHROPIC_BASE_URL: undefined,
          GITHUB_REPOSITORY: `${OWNER}/${REPO}`,
          GITHUB_EVENT_NAME: 'pull_request',
          GITHUB_EVENT_PATH: pr!.eventPath,
        },
      });

      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
      proc.stderr.on('data', (d: Buffer) => (stderr += d.toString()));

      const timer = setTimeout(() => proc.kill('SIGTERM'), 25000);
      proc.on('close', (status) => {
        clearTimeout(timer);
        resolve({ status, stdout, stderr });
      });
    });

    expect(
      result.status,
      `Expected exit code 1, got ${result.status}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    ).toBe(1);

    // Comment was still posted before Action exited
    const octokit = new Octokit({ auth: TOKEN });
    const { data: comments } = await octokit.issues.listComments({
      owner: OWNER,
      repo: REPO,
      issue_number: pr!.prNumber,
    });
    const finvalidateComment = comments.find((c) =>
      c.body?.includes('<!-- finvalidate-review -->'),
    );
    expect(
      finvalidateComment,
      `No FinValidate comment on PR #${pr!.prNumber}`,
    ).toBeDefined();
  });
});

describe('FinValidate Phase D — Clean PR', () => {
  let cleanPr: EphemeralPR | undefined;

  beforeAll(async () => {
    if (!TOKEN || !OWNER || !REPO || !ANTHROPIC_API_KEY) return;
    if (!fs.existsSync(DIST_PATH)) return;
    cleanPr = await createEphemeralPR(TOKEN, OWNER, REPO, 'clean-payment.ts');
  }, 30000);

  afterAll(async () => {
    if (cleanPr) {
      await cleanupPR(TOKEN, OWNER, REPO, cleanPr.prNumber, cleanPr.branchName, cleanPr.eventPath);
    }
  });

  it('clean path: posts "no violations" comment and exits 0', async () => {
    if (!cleanPr) throw new Error('cleanPr not created — check env vars and dist/index.js');

    const result = await new Promise<{
      status: number | null;
      stdout: string;
      stderr: string;
    }>((resolve) => {
      const proc = spawn('node', [DIST_PATH], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          'INPUT_GITHUB-TOKEN': TOKEN,
          'INPUT_ANTHROPIC-API-KEY': ANTHROPIC_API_KEY,
          INPUT_MODEL: 'claude-haiku-4-5-20251001',
          'INPUT_MAX-DIFF-TOKENS': '6000',
          'INPUT_FAIL-ON-CRITICAL': 'false',
          ANTHROPIC_BASE_URL: undefined,
          GITHUB_REPOSITORY: `${OWNER}/${REPO}`,
          GITHUB_EVENT_NAME: 'pull_request',
          GITHUB_EVENT_PATH: cleanPr!.eventPath,
        },
      });

      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
      proc.stderr.on('data', (d: Buffer) => (stderr += d.toString()));

      const timer = setTimeout(() => proc.kill('SIGTERM'), 25000);
      proc.on('close', (status) => {
        clearTimeout(timer);
        resolve({ status, stdout, stderr });
      });
    });

    expect(
      result.status,
      `dist/index.js exited with ${result.status}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`,
    ).toBe(0);

    const octokit = new Octokit({ auth: TOKEN });
    const { data: comments } = await octokit.issues.listComments({
      owner: OWNER,
      repo: REPO,
      issue_number: cleanPr!.prNumber,
    });

    const finvalidateComment = comments.find((c) =>
      c.body?.includes('<!-- finvalidate-review -->'),
    );
    expect(
      finvalidateComment,
      `No FinValidate comment found on clean PR #${cleanPr!.prNumber} in ${OWNER}/${REPO}`,
    ).toBeDefined();

    expect(finvalidateComment!.body!.toLowerCase()).toContain(
      'no fintech rule violations',
    );
  });
});
