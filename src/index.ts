import express from 'express';
import crypto from 'crypto';
import { handlePullRequest, handlePush } from './handlers';

const app = express();
const PORT = process.env.PORT || 3000;

// Parse raw body for signature verification
app.use(express.json({
  verify: (req: any, _res, buf) => {
    req.rawBody = buf;
  },
}));

function verifySignature(req: any): boolean {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('GITHUB_WEBHOOK_SECRET not set — skipping signature verification');
    return true;
  }

  const signature = req.headers['x-hub-signature-256'] as string;
  if (!signature) return false;

  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

app.post('/webhook', async (req, res) => {
  if (!verifySignature(req)) {
    console.error('Invalid webhook signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = req.headers['x-github-event'] as string;
  const payload = req.body;

  console.log(`Received event: ${event} (action: ${payload.action || 'N/A'})`);

  try {
    switch (event) {
      case 'pull_request':
        await handlePullRequest(payload);
        break;
      case 'push':
        await handlePush(payload);
        break;
      default:
        console.log(`Ignoring event: ${event}`);
    }
    res.status(200).json({ ok: true });
  } catch (error: any) {
    console.error(`Error handling ${event}:`, error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.listen(PORT, () => {
  console.log(`Copilot Auto Reviewer listening on port ${PORT}`);
});
