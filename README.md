# Copilot Auto Reviewer

A webhook server that automatically requests GitHub Copilot reviews on:
- **PRs**: When a PR is opened or updated
- **Direct pushes**: When commits are pushed to the default branch (creates a temporary PR for Copilot to review)

## Setup

### 1. Create a GitHub App

Go to https://github.com/settings/apps/new and configure:

| Field | Value |
|-------|-------|
| **Name** | `copilot-auto-reviewer` (or any name) |
| **Homepage URL** | Your Render URL |
| **Webhook URL** | `https://your-app.onrender.com/webhook` |
| **Webhook Secret** | Generate one: `openssl rand -hex 32` |

**Permissions:**
- **Pull requests**: Read & Write
- **Contents**: Read & Write (needed to create temp branches for push reviews)

**Subscribe to events:**
- Pull request
- Push

Click **Create GitHub App**, then note the **App ID**.

### 2. Generate a Private Key

On the app settings page, scroll to **Private keys** → **Generate a private key**. Save the `.pem` file.

### 3. Deploy to Render

Create a new **Web Service** on Render:

| Setting | Value |
|---------|-------|
| **Environment** | Docker |
| **Branch** | main |

Add these **Environment Variables**:

| Variable | Value |
|----------|-------|
| `GITHUB_APP_ID` | Your App ID from step 1 |
| `GITHUB_APP_PRIVATE_KEY` | Contents of the `.pem` file (replace newlines with `\n`) |
| `GITHUB_WEBHOOK_SECRET` | The secret from step 1 |
| `PORT` | `3000` |

### 4. Install the App on your Organizations

Go to `https://github.com/settings/apps/YOUR-APP-NAME/installations` and click **Install** for each organization.

- Select **All repositories** to cover every repo automatically
- New repos in that org are covered immediately

### 5. Update Webhook URL

After Render deploys, update the GitHub App's webhook URL to your Render URL:
`https://your-app.onrender.com/webhook`

## How it Works

### PR Events
When a PR is opened or updated → requests `copilot-pull-request-reviewer` as a reviewer.

### Push to Default Branch
When commits are pushed directly to the default branch:
1. Creates a temporary branch from the previous state
2. Opens a PR showing the diff
3. Requests Copilot review on that PR
4. Auto-closes the PR and deletes the temp branch after 10 minutes

## Health Check

```
GET /health
```

Returns `{ "status": "ok", "uptime": 123.45 }`
