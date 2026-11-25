# Demo Day task workspace

A responsive, password-encrypted task board on GitHub Pages. Every task includes a visible requirement summary, deadline, deliverables, and completion guidance. Organizer requirements remain distinct from internal suggestions.

The shared-sync implementation is included but **not enabled until an authenticated HTTPS backend is configured**. An empty `sync-config.json` keeps the existing browser-local mode. Do not describe local test results as a production connection to GitHub.

## User guide

Open the English [How to use](https://yuzhench.github.io/Demo-Day/guide.html) page, also linked from the login screen and board toolbar. It explains saving, task requirements, backups, files and activity, and reads the current configuration to distinguish available local features from shared features that are not yet enabled. No password or private task data is included in this public guide.

## Privacy and persistence

- The public deployment contains an AES-256-GCM encrypted task payload. The key is derived in the browser using PBKDF2-SHA-256, a random 16-byte salt and 600,000 iterations. Each encryption uses a fresh 12-byte IV.
- The password is not in this repository. Decrypted tasks and the key exist in browser memory after unlocking. Lock/reload clears the session.
- In browser-local mode, progress is encrypted in localStorage and export/import moves progress between devices. When the sync backend is enabled, GitHub `team-data` is the shared source of truth, with an encrypted browser cache. Earlier local progress is preserved separately and can be exported; it never silently overwrites team records. No Notion write-back occurs.
- General event information and interface copy are public. Private task records, team assignment choices and source links are in the encrypted payload. Raw source emails and Notion exports are excluded from this repository.
- This is static content encryption, not server-side authentication. A downloaded encrypted payload can be subjected to offline password guessing. Changing the password cannot revoke copies downloaded with the old password. Use a server with authenticated storage for confidential or synchronized workflows.

## Run locally

```sh
python3 -m http.server 8936 --bind 127.0.0.1 --directory dist
```

Visit `http://127.0.0.1:8936/`. Web Crypto requires HTTPS or localhost.

## Update content

Keep the source JSON outside the public checkout. It contains categories, tasks, people, sources, description, contact and eventUrl. The current private working source lives in the sibling `.private/tasks.json` directory and is deliberately absent from Git.

```sh
read -r -s -p 'Workspace password: ' WORKSPACE_PASSWORD
printf '%s' "$WORKSPACE_PASSWORD" | node scripts/build.mjs ../.private/tasks.json
unset WORKSPACE_PASSWORD
npm test
```

Publish only the checkout and its encrypted `dist/` directory. Never add the private source directory or the password. If only interface code changes, copy the changed interface files to `dist/` without regenerating the payload. Content rebuilds preserve the existing salt, keeping browser progress and the backend encryption key compatible. If deliberately rotating the password/salt, migrate existing backend data first. Older exported progress prompts for its password on import.

## Enable shared progress and attachments

See [backend/README.md](backend/README.md) for the HTTPS service and required server-side secrets. A fine-grained GitHub token needs Contents read/write access to this repository only; SSH push access on a developer computer does not authorize a hosted HTTP API.

1. Create the `team-data` branch once. Keep website deployments triggered by `main` only.
2. Deploy `backend/worker.mjs` on compatible Worker hosting, or run `backend/server.mjs` on a server behind HTTPS. Configure its secrets through the host's secret manager.
3. Verify sign-in, read/write and encrypted file transfer against the real repository using an explicitly identified test task/file; remove the test state after verification.
4. Run `node scripts/configure-sync.mjs https://YOUR-API-HOST` to configure both the API origin and the frontend content security policy. Push only after the backend is ready. Use `--disable` to return to browser-local mode without deleting shared data.

Shared mode supports task updates, named HTTPS links, encrypted file uploads/downloads (10 MiB per file), sign-in records and activity history. Self-reported names are not verified personal accounts. Stale concurrent edits are rejected without discarding the form. GitHub commits preserve history; the board shows the latest 200 sign-ins and 200 updates. Attachments are separate binary downloads, not automatic emails to the organizer. Larger files should be linked from PowerPoint, OneDrive, Drive, Canva or another suitable service.

## GitHub Pages

Repository: https://github.com/yuzhench/Demo-Day

Deployment target after enabling Pages: https://yuzhench.github.io/Demo-Day/

In [Settings → Pages](https://github.com/yuzhench/Demo-Day/settings/pages), set **Build and deployment → Source → GitHub Actions**. Then push to `main` or run the **Publish encrypted task board** workflow from the Actions tab. `.github/workflows/pages.yml` tests the encryption functions and deploys the pre-encrypted `dist/`. It needs no password or private task source in GitHub Actions. HTTPS is provided by Pages.

## Verification

`npm test` verifies encryption/decryption, wrong passwords, tamper detection, large encrypted records, authorization, shared updates, concurrent conflicts, attachment encryption/download and size limits against an in-memory GitHub adapter. `tests/browser-check.mjs` checks browser-local mode using localhost:9236 (isolated Chrome) and localhost:8936 (static preview), with the password on stdin.

`tests/mock-sync-server.mjs` takes the workspace password on stdin and serves ephemeral mock GitHub storage on localhost:8937 plus an isolated frontend on localhost:8938. `tests/browser-sync-check.mjs` verifies two independent browser contexts, shared notes/links, edit conflicts, uploads/downloads, oversize guidance, activity and responsive layout. **These tests do not write to real GitHub.** Test artifacts are excluded from Git.

Source content was reconciled on November 23, 2026; task requirement descriptions were expanded on November 24. Organizer deadlines are kept separate from editable internal target dates. Unassigned individual ownership is not inferred from group responsibility. The 2–3-minute limit is for the spoken pitch; the deck is due November 30, with no stated submission cutoff time and no slide-count limit.
