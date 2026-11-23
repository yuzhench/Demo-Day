# Demo Day task workspace

A responsive, password-encrypted task board ready for GitHub Pages. It supports categories, search, status and owner filters, editable owners/internal dates/notes, completion statistics, and encrypted progress export/import.

## Privacy and persistence

- The public deployment contains an AES-256-GCM encrypted task payload. The key is derived in the browser using PBKDF2-SHA-256, a random 16-byte salt and 600,000 iterations. Each encryption uses a fresh 12-byte IV.
- The password is not in this repository. Decrypted tasks and the key exist in browser memory after unlocking. Lock/reload clears the session.
- Progress is encrypted in localStorage. It is **per browser**, not a shared team database. Export/import moves progress; import replaces the current copy after confirmation. No Notion write-back occurs.
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

Publish only the checkout and its encrypted `dist/` directory. Never add the private source directory or the password. If only interface code changes, copy the changed interface files to `dist/` without regenerating the payload. A full rebuild rotates the salt; existing browser progress remains readable using the same password. Older exported progress prompts for its password on import.

## GitHub Pages

Create a new public repository, push branch `main`, and set Pages source to **GitHub Actions**. `.github/workflows/pages.yml` tests the encryption functions and deploys the pre-encrypted `dist/`. It needs no password or private task source in GitHub Actions. HTTPS is provided by Pages.

## Verification

`npm test` verifies successful encryption/decryption, rejection of wrong passwords, tamper detection, unique IVs and payload format. `tests/browser-check.mjs` runs against an isolated Chrome debugging endpoint at localhost:9236 and a preview at localhost:8936, with the password on stdin. It covers task counts, login, edits, persistence, filters, export/import, locking and responsive layout. Browser test results are excluded from Git.

Source content was reconciled on November 23, 2026. Organizer deadlines are kept separate from editable internal target dates. Unassigned individual ownership is not inferred from group responsibility.
