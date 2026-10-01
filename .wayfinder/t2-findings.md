## Findings

Investigated on branch `research/esl-archive-drive-auth`. Most of this question is **already answered by #133**, which reached the same conclusion by a separate route. Recording it here so the build session does not re-derive it.

### The Drive path is dead, and the cause is known

`getAccessToken` (`src/convex/driveBackup.ts:13`) throws `Missing Google OAuth credentials` when `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` or `GOOGLE_REFRESH_TOKEN` is absent. Local `.env.local` has the first two and **not** the refresh token or `GOOGLE_DRIVE_FOLDER_ID` — consistent with `.env.local.example`, which lists all four.

#133 goes further and names the failure on the _production_ side too: the shared refresh token is **dead**, observed as `invalid_grant` from `scheduledBackup`. So this is not a local-only gap — `daily-drive-backup` has been failing on prod as well. ADR-0012's "the Drive path is not functioning" is a live fact, not a stale note.

### Findings against each sub-question

**Scopes.** No code states a required scope; the upload uses `drive/v3/files` multipart create against a configured parent folder. Reading a file back needs `files.get` / `files.list`, which the current code never calls. Note the consequence for the shared-folder decision: with Drive's `drive.file` scope the app can only see files **it** created, which happens to cover every archive file but would **not** cover listing the HWIS backup files in the same folder. With the broader `drive` scope it sees the whole folder. This is a real fork the build session must pick deliberately.

**Folder.** `GOOGLE_DRIVE_FOLDER_ID` is unset locally, so `uploadToDrive` falls back to uploading with **no parent** (`metadata.parents` stays undefined, `driveBackup.ts:47`) — the file lands in the service account's root, not a folder. Confirms the path has never completed a successful upload in this environment.

**Shared folder — no second folder ID needed.** Confirmed: the folder id is read once from `process.env.GOOGLE_DRIVE_FOLDER_ID` (`driveBackup.ts:41`) and both the HWIS backup and the ESL archive would use it. Grilling's decision to share one folder and distinguish by filename is compatible with the current code. It costs nothing.

**Failure visibility — currently zero.** A failed upload is a thrown error inside `internalAction`; nothing is written to Convex. `crons.ts` registers `daily-drive-backup` with no error handling, so a failure is invisible from the app. This is the gap most worth closing before archiving depends on it.

**Dependence on #133.** **Yes, real, and it cuts the other way.** #133 finds that local and dev deployments hold _identical_ Google credentials and the same `GOOGLE_DRIVE_FOLDER_ID` as prod, and the `daily-drive-backup` cron is registered **unconditionally on every deployment**. Its recommendation is option C (separate folders per environment, plus a source-aware filename prefix). If the ESL archive lands before #133, an ESL archive written from a dev deployment lands in the production folder. #133 also explicitly puts "the ESL table work (#124)" out of its own scope, so neither ticket covers the other.

### Answers

- **Credentials:** re-mint `GOOGLE_REFRESH_TOKEN`. #133 puts this out of its scope and calls for doing it directly on the prod deployment — it is an ops action, not a code change, and **this map cannot complete without it happening**.
- **Folder:** set `GOOGLE_DRIVE_FOLDER_ID`; without it uploads silently land in the service account root.
- **Scopes:** pick `drive.file` (sees only app-created files — enough for archives, cannot enumerate the shared folder) or `drive` (sees the whole folder — needed if the browser lists the folder as its index).
- **Failure visibility:** a failed archive must be discoverable. Settle whether that is an `audit_logs` row, a `backups` row, or both.
- **#133 dependency:** **blocked by it.** Sequencing ESL archiving before Drive separation risks writing a dev archive into the production folder.

### Not decided here

The scope choice (the `drive.file` vs `drive` fork) is genuinely a decision, not a fact — it depends on whether the browser lists the Drive folder as its index. Left to #147.
