# GitHub team sync service

The API uses `yuzhench/Demo-Day`, branch `team-data`, and only writes under `shared/`. The website remains on GitHub Pages. Do not put GitHub credentials in the frontend or public repository.

Runtime secrets (configure in the hosting provider, never commit):

- `GITHUB_TOKEN`: fine-grained token limited to `yuzhench/Demo-Day`, Contents read/write.
- `PASSWORD_SHA256`: lowercase SHA-256 hash of the shared workspace password.
- `SESSION_SECRET`: random 32 bytes encoded as Base64, used to sign 12-hour sessions.
- `DATA_KEY`: 32-byte AES key in Base64, derived from the current website password and payload salt using PBKDF2-SHA-256 with 600,000 iterations.
- `DATA_SALT`: the `salt` from the deployed payload.json. Preserve both key and salt when updating task descriptions.
- `ALLOWED_ORIGIN`: optional; defaults to `https://yuzhench.github.io`. Local development can use `http://127.0.0.1:8936`.

`worker.mjs` exports a Worker-compatible fetch handler. `server.mjs` adapts it to Node.js 22+; launch with `node --env-file=/secure/path/sync.env backend/server.mjs`. Default bind is localhost:8937, intended to sit behind an HTTPS reverse proxy. Public hosting must provide HTTPS. No secrets are supplied in process arguments.

Data is encrypted before it is written to the public Git repository. The backend has the decryption key; this is encryption at rest, not end-to-end encryption. The history of repository commits retains previous encrypted state and files. Task updates use GitHub SHA checks and per-task revisions so simultaneous edits are not silently overwritten. Same-task conflicts ask the user to reopen the task. File uploads append to the shared task and record an actor and timestamp.

Visitors use the team password and a self-reported name. This identifies the supplied name, not a verified individual. The board must label this distinction. The most recent 200 sign-ins and 200 activity events are shown; older encrypted records remain in Git history. In-memory sign-in throttling is best-effort per process/isolate, not a global rate limiter.

The application file limit is 10 MiB, deliberately below GitHub's 100 MiB ordinary-file limit to bound encrypted API transfer and worker memory use. Larger files should be shared as PowerPoint/OneDrive/Drive/Canva HTTPS links. Link access remains controlled by the external document owner. Downloaded attachments are served as binary downloads, not executed inline.

`GET /api/health` reports readiness without secrets. Other routes require a signed bearer session, except `POST /api/auth` which checks the shared password and records a sign-in. Do not proxy arbitrary URLs, paths, branches or repositories through this service.

Production service: `https://demo-day-team-sync.yuzhench.chatgpt.site`. Hosting is managed through Sites; the source checkout is the sibling `sync-service/`. The GitHub credential is currently the owner-authorized GitHub CLI OAuth token, stored as a Sites secret. The service restricts every operation to the repository, branch and paths stated above. For future credential rotation, prefer a fine-grained repository-only token. `/api/health` verifies the configured key can read shared storage before reporting ready.
