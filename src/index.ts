import * as core from '@actions/core';
import * as github from '@actions/github';
import { reviewPR } from './review';

async function run(): Promise<void> {
  const token = core.getInput('github-token', { required: true });
  const apiKey = core.getInput('anthropic-api-key', { required: true });
  const model = core.getInput('model');
  const maxDiffTokens = parseInt(core.getInput('max-diff-tokens'));
  const failOnCritical = core.getInput('fail-on-critical') === 'true';

  const context = github.context;
  if (!context.payload.pull_request) {
    core.info('Not a pull request event, skipping.');
    return;
  }

  const result = await reviewPR({
    token,
    apiKey,
    model,
    maxDiffTokens,
    owner: context.repo.owner,
    repo: context.repo.repo,
    prNumber: context.payload.pull_request.number,
  });

  core.setOutput('violations-found', String(result.violationsFound));
  core.setOutput('critical-count', String(result.criticalCount));
  core.setOutput('comment-url', result.commentUrl ?? '');

  if (failOnCritical && result.criticalCount > 0) {
    core.setFailed(`FinValidate: ${result.criticalCount} CRITICAL violation(s) found.`);
  }
}

run().catch(core.setFailed);
