# Cloudflare LINE alert gateway

## Required secrets

- `LINE_CHANNEL_ACCESS_TOKEN`: LINE Messaging API channel access token
- `LINE_USER_ID`: administrator LINE user ID (`U` followed by 32 hexadecimal characters)
- `WEBHOOK_SECRET`: a random shared secret, at least 32 bytes

Do not store these values in source code or ordinary Worker variables. Add them
as encrypted Secrets in **Workers & Pages > Worker > Settings > Variables and
Secrets**.

Generate the shared secret locally:

```sh
openssl rand -hex 32
```

## Healthchecks.io webhook

Use the same configuration for both the down and up sides.

- Method: `POST`
- URL: `https://YOUR-WORKER.workers.dev/healthchecks`
- Request headers:

```text
Content-Type: application/json
X-Webhook-Secret: YOUR_WEBHOOK_SECRET
```

- Request body:

```json
{"name":$NAME_JSON,"status":"$STATUS","time":"$NOW"}
```

The Worker converts `$NOW` to `Asia/Taipei`, sends the message through the LINE
Messaging API, and returns HTTP 204 when delivery succeeds.

## Deployment

Production deployments are managed by Cloudflare Workers Builds through the
GitHub repository connection. A push to the `main` branch runs the following
commands in Cloudflare:

```sh
npm test
npx wrangler deploy
```

The legacy GitHub Actions workflow at `.github/workflows/deploy.yml` is retained
for rollback purposes but is disabled manually in GitHub. Do not enable it while
Cloudflare Workers Builds is active, or a push to `main` may deploy the Worker
twice.

Worker runtime secrets remain encrypted Worker secrets. They are not Cloudflare
Workers Builds variables and must not be committed to this repository.
