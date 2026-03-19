import jwt from 'jsonwebtoken';
import { Octokit } from '@octokit/rest';
import fs from 'fs';

let cachedToken: { token: string; expiresAt: number } | null = null;

function getPrivateKey(): string {
  const keyPath = process.env.GITHUB_APP_PRIVATE_KEY_PATH;
  const keyContent = process.env.GITHUB_APP_PRIVATE_KEY;

  if (keyContent) {
    return keyContent.replace(/\\n/g, '\n');
  }
  if (keyPath) {
    return fs.readFileSync(keyPath, 'utf8');
  }
  throw new Error('GITHUB_APP_PRIVATE_KEY or GITHUB_APP_PRIVATE_KEY_PATH must be set');
}

function createAppJwt(): string {
  const appId = process.env.GITHUB_APP_ID;
  if (!appId) throw new Error('GITHUB_APP_ID must be set');

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now - 60,
    exp: now + 600,
    iss: appId,
  };

  return jwt.sign(payload, getPrivateKey(), { algorithm: 'RS256' });
}

export async function getInstallationOctokit(installationId: number): Promise<Octokit> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60000) {
    return new Octokit({ auth: cachedToken.token });
  }

  const appJwt = createAppJwt();
  const appOctokit = new Octokit({ auth: appJwt });

  const { data } = await appOctokit.apps.createInstallationAccessToken({
    installation_id: installationId,
  });

  cachedToken = {
    token: data.token,
    expiresAt: new Date(data.expires_at).getTime(),
  };

  return new Octokit({ auth: data.token });
}
