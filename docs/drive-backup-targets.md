# Drive Backup Targets

Where the daily backup cron is allowed to write, and which credentials each
deployment must hold. Read this before changing any `GOOGLE_*` or `CRON_SECRET`
value, or when a local/dev backup run shows up somewhere unexpected.

## The rule

**Only the production deployment uploads to Google Drive.** Every other
deployment still writes its `backups` row in the database — that is the hot
archive the admin UI reads and restores from — but the Drive leg is skipped with
a logged reason.

This is enforced in `uploadSnapshotBackup` (`src/convex/driveBackup.ts`), the one
function that reaches Drive, using the policy in
`src/convex/shared/drive_backup_target.ts`. Both the cron (`scheduledBackup`) and
the manual admin action (`backupToDrive`) go through it, so a new caller cannot
bypass the guard.

## Why it is not just "skip everywhere but prod"

Prod, local, and dev deployments previously held the _same_ Google OAuth
credentials and the _same_ `GOOGLE_DRIVE_FOLDER_ID`. Because Drive permits
duplicate filenames, a local cron run did not overwrite the production archive —
it added `backup-2026-02-18.json` next to the real one, and from then on "which
file do I restore from?" was a guess during an incident.

Two layers prevent a repeat:

1. **The guard.** Off prod, the upload is refused unless the deployment sets
   `ALLOW_NONPROD_DRIVE_BACKUP=true` _and_ has a `GOOGLE_DRIVE_FOLDER_ID` of its
   own. Opting in without a folder is still refused — an opt-in that inherits
   prod's folder is the exact failure being fixed.
2. **The filename.** Every file is named `backup-<env>-YYYY-MM-DD.json`, on prod
   too. If a future misconfiguration does let a `dev` file reach the production
   folder, its name says so before anyone opens it. A bare
   `backup-YYYY-MM-DD.json` no longer exists on any deployment.

## Knowing when it breaks

A backup that silently stops is worse than one that fails loudly, because the
archive looks healthy right up until it is needed. Two mechanisms cover this:

1. **The admin banner.** `BackupStaleBanner`
   (`src/lib/components/admin/BackupStaleBanner.svelte`) renders on every admin
   page when no backup has succeeded within the stale window. It is shown to
   _every_ admin rather than only super users on purpose: the banner is not a
   tool for fixing the credential, it is a signal that some human should notice
   and say so.
2. **The watchdog cron.** `backup-freshness-watchdog` runs at 23:17 UTC and
   throws when the archive is stale, which shows up in the Convex dashboard logs
   view. Convex has no built-in email or webhook for cron failures, so the logs
   view is the only machine-readable signal it offers — worth checking
   occasionally.

Both read the `backupHeartbeats` table, written by `recordBackupSuccess` after
Drive returns a file id. They deliberately do **not** list the Drive folder: a
check that needs the Drive credential fails for the same reason the backup
failed and cannot tell "the archive is stale" from "I cannot see anything".
Reading our own table keeps detection working precisely when Drive is what broke.

The one failure this cannot catch is a total Convex outage, where no cron runs at
all. Covering that needs an external scheduler, which is not in place.

## Per-deployment source of truth

| Var                          | prod                                      | dev                               | local                               |
| ---------------------------- | ----------------------------------------- | --------------------------------- | ----------------------------------- |
| `CONVEX_DEPLOYMENT`          | `prod:hwis`                               | `dev:<name>`                      | `local:hwis`                        |
| `GOOGLE_CLIENT_ID`           | set                                       | set (for Google login)            | set (for Google login)              |
| `GOOGLE_CLIENT_SECRET`       | set                                       | set                               | set                                 |
| `GOOGLE_REFRESH_TOKEN`       | set, **user token from the login client** | **do not set**                    | **do not set**                      |
| `GOOGLE_DRIVE_FOLDER_ID`     | production backup folder                  | scratch folder, or unset          | from `LOCAL_GOOGLE_DRIVE_FOLDER_ID` |
| `ALLOW_NONPROD_DRIVE_BACKUP` | unset (not needed)                        | `true` only with a scratch folder | `true` only with a scratch folder   |
| `CRON_SECRET`                | set                                       | local value                       | local value                         |

Notes:

- `GOOGLE_REFRESH_TOKEN` is a **long-lived** credential, and the one value that
  must never be copied to a machine running untrusted code. The prod value was
  also dead as of the writing of this document — a stale local cron replay failed
  with `invalid_grant` from it. Re-mint it directly on the prod deployment; see
  **Re-minting the refresh token** below.
- It is a **user** refresh token belonging to a real human's Google account, _not_ a
  service account. A service account authenticates with a downloaded JSON key and
  needs no refresh token at all, so "use a service account" is a different (larger)
  change, not a way to re-mint this one. The consequence is that **that account must
  keep Drive access to the backup folder** — revoking its Drive access silently
  breaks the upload while leaving the token itself valid.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` are the **login** client from ADR-0003
  — the same one teachers authenticate through. The Drive upload reuses it. That
  coupling is why changing the OAuth client's type or redirect URIs is not a
  Drive-only change: it would break Google sign-in for every teacher and student.
  Treat the client as untouchable and re-mint the _token_ against it.
- `CRON_SECRET` is not a Drive credential; it guards the `exportDataForCron`
  query. It is listed here because the local env-sync script now manages it, and
  it was previously unmanaged — which left no documented source of truth for the
  local backup path at all.

## Drive service account

The credential the backup path actually wants. It authenticates with a private
key, so it has **no expiry, no consent screen, and no dependency on a person** —
the three things that made the refresh-token path fail silently for a month.

### 1. Create the service account

In the same Google Cloud project that owns the OAuth client (project id
`hwis-31a3d`):

1. **IAM & Admin → Service Accounts → Create service account**.
2. Name: `hwis-backup`. ID and display name can stay the same.
3. **Skip the two role-assignment steps.** The service account needs no project
   role at all. Drive access comes entirely from folder sharing (step 2), so
   granting it a project role would be broader than necessary.
4. **Skip creating a key for now** — create it in step 3.

Copy the service account email; it looks like
`hwis-backup@hwis-31a3d.iam.gserviceaccount.com`. You need it twice below.

### 2. Share the backup folder with it

Open the backup folder in Drive (the one holding the Aug–Sep files, whose ID is
`GOOGLE_DRIVE_FOLDER_ID`) → **Share** → add the service account email → role
**Editor**.

Editor, not Viewer: the account must create files. Not Content Manager — that
would let it delete backups.

**The folder itself does not move and its ID does not change.** Everything already
in it stays exactly where it is.

> This step is what makes a service account able to write there. `drive.file`
> would not suffice — it only grants access to files the app itself created — so
> the code requests full `drive`. That broader scope is bounded in practice by
> this one folder share; see `DRIVE_SERVICE_ACCOUNT_SCOPES`.

### 3. Create a key

Back on the service account → **Keys** tab → **Add key** → **Create new key** →
key type **JSON** → **Create**. It downloads a `.json` file. Put it somewhere safe
and out of the repo; treat it like a password, because it is one.

From that file you need two values:

- `client_email` → `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `private_key` → `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`

The `private_key` is a multi-line PEM. When you set it, keep the `\n` escapes
exactly as they appear in the JSON — do not convert them to real newlines. The
code unescapes them itself, and a key whose newlines were mangled fails with an
opaque parse error.

### 4. Configure the deployment

```bash
bunx convex env set GOOGLE_SERVICE_ACCOUNT_EMAIL 'hwis-backup@hwis-31a3d.iam.gserviceaccount.com' --prod
bunx convex env set GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY "$(jq -r .private_key ~/Downloads/<downloaded>.json)" --prod
bunx convex env list --prod
```

Then deploy the code that reads them, and confirm with a real run:

```bash
bunx convex run --prod internal/driveBackup:scheduledBackup '{}'
```

Expect `success: true` and a filename of `backup-prod-YYYY-MM-DD.json`.

### 5. Remove the old credential

Only once step 4 succeeds:

```bash
bunx convex env remove GOOGLE_REFRESH_TOKEN --prod
bunx convex env remove GOOGLE_CLIENT_SECRET --prod
```

Then revoke the 7-day token at <https://myaccount.google.com/permissions>. The
code falls back to it only while the service account is absent, so leaving it set
means a future half-finished migration silently prefers the expiring credential.

## Local development

A local deployment needs **neither** credential: the environment guard refuses the
upload unless `ALLOW_NONPROD_DRIVE_BACKUP=true` _and_ a scratch
`GOOGLE_DRIVE_FOLDER_ID` are both set. `scripts/convex-local-env-sync.sh` never
syncs either credential, which is deliberate — a long-lived Drive credential has
no business on a laptop running untrusted code.

## Re-minting the refresh token

> **Historical — you probably do not need this.** The `GOOGLE_REFRESH_TOKEN` path
> was replaced by a service account. A refresh token minted while the OAuth consent
> screen is in **Testing** status carries `refresh_token_expires_in: 604799` — it
> dies after 7 days, silently, and that is exactly how the Drive archive went a
> month without an upload while the database backups looked healthy. If you are
> reading this to fix a dead token, **skip to [Drive service account](#drive-service-account)**
> and delete the token rather than minting a new one.
>
> The procedure below is kept only to explain how the old credential worked.

`invalid_grant` on `scheduledBackup` means the stored token is dead. A refresh
token has no "renew" operation — it is replaced by running the authorization flow
again and keeping the new token.

**1. Do not change the OAuth client.** You do not need a Desktop-app client, and
switching to one would break Google sign-in for every teacher and student — the
login client and the Drive client are the _same_ credential here (ADR-0003).
Re-mint the token against the client exactly as it is.

A Web-server client can also be issued a refresh token, provided the consent
request is a confidential one: it carries `client_secret` alongside `client_id`,
and the code is exchanged with that secret. That is what the existing, working
backup path did, so the client you already have is capable of it and needs no
change. (A Desktop-app client can also produce refresh tokens, and with
`client_id` alone — but reaching for that means changing a sign-in-critical
client, which is not a trade worth making to save one curl flag.)

All you need to confirm: the client id, and whether your consent flow passes
`client_secret`. The app already has all three vars configured.

Before anything else, confirm the consent screen can render at all. Google answers
with `accounts.google.com/info/unknownerror?...&requestPath=/signin/oauth/v3/consent`
when it cannot build the consent page — no redirect happens, so a local listener
correctly sees nothing. Check **Google Cloud Console → OAuth consent screen**:

- The screen is fully filled in (app name, support email, developer contact email).
- **Publishing status** matters. If the app is in _Testing_, your Google account
  must be listed under **Test users** — an account outside that list cannot mint a
  refresh token. Adding yourself is additive and affects nobody's login.
- A `drive.file` scope is non-sensitive, so a _Testing_ app is fine once you are a
  test user. No verification or branding review is required.

If the consent screen was never configured — plausible for an app that only ever
needed silent sign-in — that is the whole problem, and filling it in fixes it.

**2. Get a refresh token** — on a machine you control, never in CI:

```bash
# The login client's id, exactly as the prod deployment has it.
export CID="<prod GOOGLE_CLIENT_ID>"
export CSECRET="<prod GOOGLE_CLIENT_SECRET>"

# scope 1 = drive.file: files this app creates or opens, nothing else.
# access_type=offline is what makes Google return a refresh_token at all.
# prompt=consent forces a re-prompt so a *fresh* token is issued; without it an
# already-authorized account can return no refresh_token and you will think it worked.
#
# Do NOT send client_secret here. The authorize endpoint rejects it outright
# ("Parameter not allowed for this message type: client_secret") — the secret
# belongs only on the token exchange below.
#
# redirect_uri must EXACTLY match one registered on the client, or Google fails
# with redirect_uri_mismatch.
#
# **Capture the code with a local listener, not the app's own callback.** The
# Better Auth callback cannot be reused: it consumes the code itself, finds no
# matching state nonce, and bounces a signed-in user straight to /admin, so the
# code is gone before it can be read. Codes are single-use — request a new one.
#
# Step A. Register `http://localhost:9004` on the client (Google Console →
# Credentials → Authorized redirect URIs → Add). This is ADDITIVE: it adds a URI
# and changes nothing existing, so teacher Google login is unaffected. Verify by
# logging in as a teacher afterwards.
#
# Step B. Start the listener first (macOS nc needs -l; port must match the URL):
#
#   nc -l 9004
#
# Step C. Open this in the browser (one line):
#
#   https://accounts.google.com/o/oauth2/v2/auth?client_id=<GOOGLE_CLIENT_ID>&redirect_uri=http%3A%2F%2Flocalhost%3A9004&response_type=code&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive.file&access_type=offline&prompt=consent
#
# After approving, the terminal prints the request line, including `code=...`.
# That code is the one to exchange below. `nc` exits afterwards; that is fine.
```

Sign in as the account that should own the backups and approve. The `nc` listener
prints the request line containing `code=...` — that is the code to exchange below.

```bash
curl -s -X POST https://oauth2.googleapis.com/token \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d "client_id=$CID" \
  -d "client_secret=$CSECRET" \
  -d "code=<the code>" \
  -d "grant_type=authorization_code" \
  -d "redirect_uri=http://localhost:9004"
```

Keep `refresh_token` from the response. If the JSON has no `refresh_token` key,
the consent was not re-prompted — go back and confirm `prompt=consent` is present.

**3. Verify it before deploying it.** This is the step that turns a silent
failure into a five-second check:

```bash
curl -s -X POST https://oauth2.googleapis.com/token \
  -d "client_id=$CID" \
  -d "client_secret=<prod GOOGLE_CLIENT_SECRET>" \
  -d "refresh_token=<the new refresh token>" \
  -d "grant_type=refresh_token"
```

An `access_token` back means the token works. Still `invalid_grant`? The account
revoked access, the client secret is stale, or the account is not a test user.

**4. Confirm the account can reach the folder.** Open
`https://drive.google.com/drive/folders/<GOOGLE_DRIVE_FOLDER_ID>` while signed in as
that account and check you can create files. A token belonging to an account
without access to the folder uploads to _that account's own_ Drive rather than the
backup folder — the upload reports success and the archive silently goes nowhere.
This is the failure mode most likely to survive a "fix" that appears to work.

**5. Set it on the prod deployment only:**

```bash
bunx convex env set GOOGLE_REFRESH_TOKEN '<token>' --deployment prod:hwis
bunx convex env list --deployment prod:hwis   # confirm it is set
```

**6. Prove the backup actually ran** — do not assume the 20:00 UTC cron worked:

```bash
bunx convex run --deployment prod:hwis internal/driveBackup:scheduledBackup '{}'
```

Expect `success: true` and a `filename` of `backup-prod-YYYY-MM-DD.json`
(ADR-0026). `skipped: true` means the environment guard refused the upload;
`invalid_grant` means the token still is not good.

**7. Revoke the old token** at <https://myaccount.google.com/permissions> once the
new one is verified. It is already dead, but the entry should not linger.

Then set `LOCAL_GOOGLE_DRIVE_FOLDER_ID` to a scratch folder and leave local with
no refresh token at all — that is the arrangement the guard is built for.

## The second upload path

`src/routes/api/cron-backup/+server.ts` is a second, independent Drive uploader:
it reads the same three Google vars from the **Vercel** env rather than the Convex
env, and builds the same snapshot over HTTP. Nothing currently schedules it — no
Vercel cron in `vercel.json`, and no caller anywhere in the codebase — so it is
not what is failing today.

It is **no longer an unguarded way in**. It now calls the same
`resolveDriveEnvironmentFromEnv` / `decideDriveUpload` / `buildDriveBackupFilename`
policy the Convex cron uses, so it cannot write an un-prefixed
`backup-YYYY-MM-DD.json` into the production folder. Two things to know if it is
ever scheduled:

- Set `BACKUP_DEPLOYMENT=prod:hwis` in the **Vercel** prod env. A Vercel function
  has no `CONVEX_DEPLOYMENT`, so without this it classifies as `unknown` and
  **refuses** — including on production. That is the intended fail-safe: an
  environment that cannot name itself does not get to write to the backup folder.
  It also needs `ALLOW_NONPROD_DRIVE_BACKUP` unset (prod) and its own
  `GOOGLE_DRIVE_FOLDER_ID`.
- The Vercel env needs `GOOGLE_REFRESH_TOKEN`, `GOOGLE_CLIENT_ID`, and
  `GOOGLE_CLIENT_SECRET` set separately. Setting them on the Convex deployment
  does **not** configure this route; it returns `Missing Google credentials`.

Note the two paths can be pointed at the same folder, in which case one day's
archive contains two files — `backup-prod-<date>.json` from each. That is
harmless, but prefer running one of them.

## Local setup

`bun run convex:local:env-sync` syncs the vars above from `.env.local`, falling
back to `.env`. It reads the Drive folder from `LOCAL_GOOGLE_DRIVE_FOLDER_ID`,
**not** from `GOOGLE_DRIVE_FOLDER_ID`, so pointing the app `.env` at the
production folder cannot leak into the local deployment through the script.

To exercise the upload path locally, set in `.env.local`:

```
LOCAL_GOOGLE_DRIVE_FOLDER_ID=<a scratch Drive folder you own>
ALLOW_NONPROD_DRIVE_BACKUP=true
GOOGLE_REFRESH_TOKEN=<a user refresh token for the login client, scoped to that folder only>
```

The refresh token is only needed for that last case; without it the local run
logs a skip and still writes its database row.

## Verifying

The policy is unit-tested in `src/convex/driveBackup.test.ts`, including the case
that matters most: a dev deployment holding prod's credentials and folder id is
refused, and prod still fails loudly rather than silently skipping when its own
credentials are missing.

To see it in the log, run the action against a dev deployment and look for:

```
[driveBackup] Skipping Drive upload of backup-dev-YYYY-MM-DD.json: not a production deployment and ALLOW_NONPROD_DRIVE_BACKUP is not set, ...
```

## What is deliberately unchanged

- The `source` vocabulary (`manual` | `system_migration` | `system_safety` |
  `system_cron`) — ADR-0009 owns it.
- Restore permissions. `restoreFromBackup` stays admin-only; a skipped Drive
  upload grants nobody anything.
- Retention and pruning (ADR-0012).
- The in-database `backups` row on non-prod. It is written on every deployment,
  so the admin UI and the restore flows stay fully testable locally.

## Related

- `docs/adr/0026-drive-backup-environment-targeting.md` — the decision.
- `docs/adr/0009-backup-and-disaster-recovery.md` — what the archive is for.
- `docs/convex-local-recovery.md` — local deployment recovery.
