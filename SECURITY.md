# Security Policy

## Public deployment boundary

GitHub Pages must be built only through `.github/workflows/pages.yml`. The workflow
uses an explicit allowlist and publishes these static applications only:

- `guitar-learning/`
- `space-game/`
- `typing-trainer/`

Never add admin tools, API endpoints, credentials, operational runbooks, personal
data, payment identifiers, or private application URLs to the Pages artifact.

## Secrets

Do not commit `.env`, `credentials.json`, uploaded inspection photos, tokens, or
service-account keys. Production secrets must be supplied through the deployment
platform or a secret manager and must not use fallback values.

## Reporting

If a credential or personal-data endpoint is exposed, disable the affected
deployment first, rotate the credential where applicable, preserve evidence, and
then repair the code before restoring access.
