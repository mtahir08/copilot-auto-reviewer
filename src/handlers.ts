import { Octokit } from '@octokit/rest';
import { getInstallationOctokit } from './auth';

const COPILOT_REVIEWER = 'copilot-pull-request-reviewer';

interface PullRequestEvent {
  action: string;
  pull_request: {
    number: number;
    head: { sha: string };
    base: { ref: string };
  };
  repository: {
    name: string;
    owner: { login: string };
    default_branch: string;
  };
  installation?: { id: number };
}

interface PushEvent {
  ref: string;
  before: string;
  after: string;
  commits: Array<{ id: string; message: string }>;
  repository: {
    name: string;
    owner: { login: string; name?: string };
    default_branch: string;
  };
  installation?: { id: number };
  pusher: { name: string };
}

async function requestCopilotReview(octokit: Octokit, owner: string, repo: string, prNumber: number) {
  try {
    await octokit.pulls.requestReviewers({
      owner,
      repo,
      pull_number: prNumber,
      reviewers: [COPILOT_REVIEWER],
    });
    console.log(`Requested Copilot review on ${owner}/${repo}#${prNumber}`);
  } catch (error: any) {
    // Copilot reviewer may not be available — log and continue
    console.error(`Failed to request Copilot review on ${owner}/${repo}#${prNumber}:`, error.message);
  }
}

export async function handlePullRequest(payload: PullRequestEvent) {
  if (!['opened', 'synchronize'].includes(payload.action)) return;

  const installationId = payload.installation?.id;
  if (!installationId) {
    console.error('No installation ID in pull_request event');
    return;
  }

  const octokit = await getInstallationOctokit(installationId);
  const { owner, name: repo } = payload.repository;

  await requestCopilotReview(octokit, owner.login, repo, payload.pull_request.number);
}

export async function handlePush(payload: PushEvent) {
  const defaultBranch = payload.repository.default_branch;
  const pushedRef = payload.ref;

  // Only act on pushes to the default branch
  if (pushedRef !== `refs/heads/${defaultBranch}`) return;

  // Skip if no commits (e.g. branch deletion)
  if (!payload.commits?.length) return;

  const installationId = payload.installation?.id;
  if (!installationId) {
    console.error('No installation ID in push event');
    return;
  }

  const octokit = await getInstallationOctokit(installationId);
  const owner = payload.repository.owner.login;
  const repo = payload.repository.name;
  const commitSha = payload.after;
  const tempBranch = `copilot-review/${commitSha.slice(0, 8)}`;

  try {
    // 1. Create a temp branch from the commit before the push
    await octokit.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${tempBranch}`,
      sha: payload.before,
    });

    // 2. Create a PR from default branch head into the temp branch (to show the diff)
    const { data: pr } = await octokit.pulls.create({
      owner,
      repo,
      title: `[Auto Review] Commit ${commitSha.slice(0, 8)} — ${payload.commits[0]?.message?.split('\n')[0] || 'Direct push'}`,
      head: defaultBranch,
      base: tempBranch,
      body: [
        `Automated review PR for direct push to \`${defaultBranch}\`.`,
        '',
        '**Commits:**',
        ...payload.commits.map((c) => `- \`${c.id.slice(0, 8)}\` ${c.message.split('\n')[0]}`),
        '',
        `Pushed by: ${payload.pusher.name}`,
        '',
        '_This PR was created automatically and will be closed after review._',
      ].join('\n'),
    });

    console.log(`Created review PR ${owner}/${repo}#${pr.number} for push ${commitSha.slice(0, 8)}`);

    // 3. Request Copilot review
    await requestCopilotReview(octokit, owner, repo, pr.number);

    // 4. Schedule cleanup — close the PR and delete the temp branch after some time
    setTimeout(async () => {
      try {
        await octokit.pulls.update({
          owner,
          repo,
          pull_number: pr.number,
          state: 'closed',
        });
        await octokit.git.deleteRef({
          owner,
          repo,
          ref: `heads/${tempBranch}`,
        });
        console.log(`Cleaned up review PR ${owner}/${repo}#${pr.number}`);
      } catch (err: any) {
        console.error(`Cleanup failed for ${owner}/${repo}#${pr.number}:`, err.message);
      }
    }, 10 * 60 * 1000); // Clean up after 10 minutes

  } catch (error: any) {
    console.error(`Failed to create review PR for push to ${owner}/${repo}:`, error.message);

    // Cleanup temp branch if PR creation failed
    try {
      await octokit.git.deleteRef({ owner, repo, ref: `heads/${tempBranch}` });
    } catch (_) {
      // Ignore cleanup errors
    }
  }
}
