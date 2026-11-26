# Private cloud deployment

The private site is designed to fail closed. Do not publish it until Cloudflare
Access and both Apps Script deployments reject unsigned requests.

## Boundary

- GitHub Pages publishes only the existing public allowlist.
- Cloudflare Pages publishes `_private_cloud`, built from the private allowlist.
- Cloudflare Access and the Pages middleware both require a valid Access JWT.
- `ALLOWED_EMAILS` is a second allowlist enforced by the middleware.
- Browser code calls only `/api/library` and `/api/running`.
- The Pages Functions proxy signs every upstream request with HMAC-SHA256.
- Apps Script must verify the signature before dispatching any action.

## Required Cloudflare configuration

Use Node.js 22 or later, then run `npm ci`.

1. Create a Pages project named `myserver-private` from the private GitHub repo.
2. Use `npm run build:private:cloud` as the build command.
3. Use `_private_cloud` as the build output directory.
4. Enable a Cloudflare Access policy for the production `pages.dev` hostname and
   every custom domain. Allow only the intended email addresses and require MFA.
5. Copy the Access application AUD tag and team domain.
6. Add these encrypted production secrets/variables in Workers & Pages settings:

   - `TEAM_DOMAIN`: `https://YOUR-TEAM.cloudflareaccess.com`
   - `POLICY_AUD`: the Access application Audience tag
   - `ALLOWED_EMAILS`: comma-separated exact email addresses
   - `APPS_SCRIPT_LIBRARY_URL`: the current Library deployment URL
   - `APPS_SCRIPT_RUNNING_URL`: the current Running deployment URL
   - `APPS_SCRIPT_HMAC_SECRET`: at least 32 random bytes; never commit it

Apply separate values to preview deployments or disable previews. Never expose a
preview URL without an Access policy.

## Required Apps Script containment

1. Back up both Apps Script projects and their Sheets.
2. Copy `cloudflare/apps-script-proxy-auth.gs` into each project.
3. Add `MY_SERVER_PROXY_SECRET` in Apps Script Project Settings > Script
   properties. Its value must match `APPS_SCRIPT_HMAC_SECRET` in Cloudflare.
4. Call `requireCloudProxy_(e, 'GET')` at the first line of `doGet(e)` and
   `requireCloudProxy_(e, 'POST')` at the first line of `doPost(e)`, before
   parsing or dispatching any action.
5. Strava OAuth callbacks require a separate one-time `state` check. Keep Strava
   Connect disabled until its callback is routed through the proxy or its state
   is validated and all other unsigned `doGet` actions are denied.
6. Create a new deployment. Do not reuse an anonymously callable old deployment.
7. From a signed-out browser, verify that unsigned read and write requests fail.
8. Only then place the new deployment URLs in Cloudflare secrets and archive the
   old deployments.

The Apps Script source is not stored in this repository and the connected Drive
provider does not expose Apps Script project files. This owner-side change is a
hard deployment gate, not an optional hardening step.

## Verification

Run:

```bash
npm ci
npm run build:public
npm run verify:public
npm run build:private
npm run verify:private
npm run build:private:cloud
npm run verify:private:cloud
npm test
npm run check:secrets
```

Before enabling the production hostname, also verify:

- unauthenticated requests redirect to Access or return 403;
- an authenticated but unlisted email receives 403;
- `/api/library` and `/api/running` return 503 when secrets are absent;
- direct unsigned Apps Script GET and POST calls cannot read or mutate data;
- `.git`, `.github`, `scripts`, runbooks and source maps return 404;
- camera access works only on the HTTPS private hostname.
