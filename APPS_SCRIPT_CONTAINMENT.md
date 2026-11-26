# Google Apps Script containment

The deployed Running and Library Apps Script web apps are outside this repository.
Removing their URLs from GitHub Pages does not revoke access to those deployments.

## Required owner action

For each affected Apps Script project:

1. Open **Deploy > Manage deployments** in Apps Script.
2. Archive or disable the deployment whose URL is embedded in `running-app/` or
   `library/`.
3. If the application must remain available, create a new deployment that does
   not allow anonymous access. Prefer access restricted to the owner's Workspace
   domain or users who authorize as themselves.
4. Add server-side authorization checks for every action. Read actions and write
   actions must both fail closed when the caller has no verified identity.
5. Do not replace this control with a URL, API key, or password embedded in the
   browser JavaScript.
6. Verify from a signed-out/incognito browser that profile, activity, notes,
   books, Strava settings, Calendar actions, and all mutation actions return an
   authorization error.

The private Cloudflare design uses a same-origin Pages Functions proxy plus
HMAC-signed upstream requests. Follow `CLOUDFLARE_PRIVATE_DEPLOYMENT.md` and add
`cloudflare/apps-script-proxy-auth.gs` to both Apps Script projects before any
private cloud deployment. Cloudflare Access on the HTML alone does not protect
an anonymous Apps Script endpoint.

The current anonymous deployments must be considered discoverable even after a
new URL is issued because the old URLs exist in Git history and browser caches.
