# Kanban Discord Activity

## Overview
This project is a Discord Activity Kanban board built with a Vite React frontend, Cloudflare Pages hosting, Cloudflare Pages Functions backend, and a Cloudflare D1 database.

The app supports a shared board experience inside Discord voice channels. The current implementation uses channel scoped persistence so users in the same voice channel see the same board, and returning to that same channel later resumes the saved work.

## Current Architecture

### Frontend
- Vite React app in `client/`
- Main UI in `client/src/App.jsx`
- Discord SDK setup in `client/src/discord.js`
- Main styling in `client/src/styles.css`

### Backend
- Cloudflare Pages Functions in `client/functions/`
- Card routes in `client/functions/api/cards/`
- Discord token exchange route in `client/functions/api/discord/token.js`
- Shared server session helper in `client/functions/_lib/session.js`

### Database
- Cloudflare D1 database
- Current remote database binding name: `DB`

### Discord
- Production Discord app for the production board
- Development Discord app for preview and testing

## Important Environment Note
This project currently uses the same remote Cloudflare D1 database for both preview and production deployments.

That means:
- the production Discord app and the development Discord app can read and write the same underlying D1 database
- board separation currently depends on `channel_id`
- the development app should only be used in dedicated test voice channels
- do not use the development app in a real production channel unless you intend to modify that channel's board data

A future improvement would be to split preview and production into separate D1 databases.

## Workflow Columns
The board currently uses these columns:
- Backlog
- In Progress
- Testing
- Approval

The Approval column supports two states:
- pending approval
- approved

Approved cards are visually marked, locked down, and mostly read only.

## Features
- Shared board inside Discord Activities
- Channel scoped persistence using `channel_id`
- Verified server side write authentication through a signed Discord session cookie
- Create, update, delete, and reset routes require authenticated server session
- Per user card creation rate limiting tied to verified Discord user id
- Approval workflow with pending approval and approved state
- Audit trail comments with timestamps
- Automatic comments for field changes, column moves, and approval
- Owner, priority, comments, and approval state persistence in D1
- Dynamic board member syncing from Discord participants
- Assign to me and Unassign owner actions
- Legacy owner values still supported in the UI
- Summary view with current board controls
- Import board from JSON with in app confirmation
- Export board to JSON through a manual copy modal
- Board area scrolls inside the main content area instead of scrolling the whole window
- Comments filter to hide system comments by default
- Separate production and development Discord apps
- Cloudflare preview deployment for development testing

## Security and Auth Notes
The app now performs a minimal server auth pass for write actions.

### Current protections
- Discord OAuth code exchange is handled on the server
- the server verifies the Discord user before minting a signed session cookie
- write routes use the verified server session instead of trusting client submitted actor identity
- card creation rate limiting is enforced by verified Discord user id
- Discord client secret is stored as a Cloudflare secret and is never committed to source control
- session signing uses `DISCORD_SESSION_SECRET`, which must also be stored as a secret and never committed to source control

### Current limitations
- preview and production still share one remote D1 database
- delete and reset actions do not write to a separate immutable audit table
- import trusts the structure of the import file after validation and sanitization, but does not preserve a separate historical import log

## Local Development

### Prerequisites
- Node.js installed
- npm installed
- Wrangler installed locally in the project or available through `npx`
- Cloudflare account and Pages project already configured
- D1 database already created and bound

### Important local note
Local Pages development uses a local D1 database unless you explicitly work against remote. Keep local and remote schema changes in sync.

### Local secrets
Create `client/.dev.vars` and add:

```dotenv
DISCORD_CLIENT_SECRET=YOUR_DISCORD_CLIENT_SECRET
DISCORD_SESSION_SECRET=YOUR_RANDOM_SESSION_SECRET
```

Generate a random session secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Do not commit `client/.dev.vars`.

### Run locally
From the `client/` folder:

```bash
git status
npm install
npm run build
npx wrangler pages dev .\dist --compatibility-date=2026-04-03
```

Then open the local URL shown in the terminal.

### Useful local API checks
Check the current board using the default global board:

```text
http://localhost:8788/api/cards?channel_id=global
```

### Local D1 commands
Run from `client/`.

View schema:

```bash
npx wrangler d1 execute discord-kanban-db --command "PRAGMA table_info(cards);"
```

View rows:

```bash
npx wrangler d1 execute discord-kanban-db --command "SELECT id, title, channel_id FROM cards ORDER BY id ASC;"
```

## Cloudflare Secrets
The following secrets must exist in any deployed environment that needs authenticated write actions:

- `DISCORD_CLIENT_SECRET`
- `DISCORD_SESSION_SECRET`

For preview testing, add them to the Preview environment in Cloudflare Pages and redeploy the preview build.

## How to Use the App in Discord

### Production use
1. Open Discord desktop
2. Join the intended voice channel
3. Start the production Kanban Activity
4. Everyone in that same voice channel should see the same board
5. Re entering that same channel later should resume the saved board

### Development use
1. Open Discord desktop
2. Join a dedicated test voice channel
3. Start the development Kanban Activity
4. Verify the preview version is the one being loaded
5. Perform testing only in test channels

### Notes
- same channel should show the same board
- different channels should show different boards
- approved cards are mostly locked down and intended to be read only
- export in Discord currently uses a manual copy modal because automatic download is not reliable in the embedded client

## How to Use Import and Export

### Export board
1. Open the Team Summary view
2. Click `Export Board`
3. A modal will open with the board JSON already selected
4. Copy the JSON and save it manually as a `.json` file

### Import board
1. Open the Team Summary view
2. Click `Import Board`
3. Select a previously exported `.json` file
4. Confirm the import in the in app modal
5. The current board will be replaced with the imported cards

## How to Test the App

### Basic functional test
- create a new card
- edit title, description, owner, and priority
- add a comment
- use Assign to me
- move the card through Backlog, In Progress, Testing, and Approval
- approve the card
- verify approved card styling and locked state
- refresh and confirm persistence

### Channel persistence test
1. Open the app in voice channel A
2. Create a clearly named card
3. Close and reopen the app in voice channel A
4. Confirm the card still exists
5. Open the app in voice channel B
6. Confirm channel B does not show channel A's board
7. Create a different card in channel B
8. Return to channel A and confirm the boards stay separate

### Import and export test
1. Create several cards in a test channel
2. Export the board
3. Save the JSON manually
4. Reset the board
5. Import the saved JSON file
6. Confirm all cards return correctly

### Auth and security test
- verify the Discord status box shows authenticated user state
- create a card
- edit a card
- delete a card
- reset the board
- confirm these actions work only when authenticated
- confirm rate limiting still applies for repeated card creation

## Deployment Model

### Production
- branch: `main`
- Discord app: production app
- Cloudflare Pages production deployment

### Development
- branch: development branch used for preview testing
- Discord app: development app
- Cloudflare Pages preview deployment

## How to Update a New Version

### 1. Make your code changes locally
Work in the development branch first.

### 2. Check status
From `client/` or project root:

```bash
git status
```

### 3. Commit and push
From `client/`:

```bash
git add .
git commit -m "Describe the update here"
git push
```

### 4. Wait for Cloudflare preview to rebuild
In Cloudflare:
- go to Workers and Pages
- open the project
- open Deployments
- wait for the newest preview deployment to finish

### 5. Open the preview URL
Use the latest preview deployment URL to verify the update in a normal browser.

### 6. Test the update in the Discord development app
- use the development Discord app
- point it at the preview build
- test in a dedicated test voice channel

## How to Get the Current Preview URL
1. Open Cloudflare
2. Go to Workers and Pages
3. Open the Kanban project
4. Open Deployments
5. Open the newest preview deployment
6. Copy the preview URL

## How to Update Discord Settings for a New Development Build

### When you create a new development Discord app
1. Create the new Discord application
2. Enable Activities
3. Add the correct URL Mapping for the Cloudflare preview host
4. Ensure supported platforms are enabled
5. Use the correct development app client ID in preview

### Current Wrangler pattern
`wrangler.toml` should use:
- production Discord client ID in top level `vars`
- development Discord client ID in `env.preview.vars`
- D1 binding at top level and also under `env.preview.d1_databases`

### Example deployment reminder
After updating `wrangler.toml`, commit and push so Cloudflare preview rebuilds with the new values.

## Cloudflare Notes
- `wrangler.toml` is the source of truth for non secret environment variables
- preview specific values belong under `env.preview`
- D1 bindings are not inherited into preview automatically and must be repeated under `env.preview.d1_databases`
- Discord client secrets should be stored as Cloudflare Secrets, not committed to source control
- `DISCORD_SESSION_SECRET` should also be stored as a Cloudflare Secret, not committed to source control

## Discord Notes
- production and development should use separate Discord apps
- development app should point to preview builds
- production app should stay pointed to production
- if Discord behaves strangely during testing, fully restarting or reinstalling Discord may help
- Discord may block automatic file download or clipboard APIs inside the embedded Activity

## Known Behaviors and Troubleshooting

### Cards do not appear immediately
Use the `Refresh Board` button. The app also performs an automatic delayed reload after Discord initialization.

### Card says not found in this channel
This usually means older cards were created before channel scoping or under a different `channel_id`.

### Preview changes production data
Preview and production currently share the same remote D1 database. Use only dedicated test voice channels in the development app.

### White screen in Discord but not browser
This has previously been caused by Discord client issues rather than the app build. Fully restarting or reinstalling Discord resolved it.

### Export does not download a file automatically
This is expected in the current Discord embedded environment. Use the export modal and manually save the selected JSON to a `.json` file.

### Import appears to do nothing
The current build uses an in app confirmation modal after selecting a file. Confirm the import there.

## Future Improvement Ideas
- split preview and production into separate D1 databases
- add a separate immutable audit log table
- stronger admin or moderator safeguards
- optional direct browser based file export for non Discord use

## Release Notes

### Version 1
#### Added
- initial Discord Activity Kanban concept
- frontend only board experience
- board and summary views
- modal editing

#### Notes
- version 1 had no backend persistence
- version 1 remained on main while version 2 was developed and tested separately

### Version 2
#### Added
- Cloudflare Pages Functions backend
- Cloudflare D1 database support
- persisted cards
- owner, priority, comments, and approval state persistence
- Testing column
- Approval column with pending approval and approved state
- Approve action in Approval column
- audit trail comments with timestamps
- automatic comments for non comment field changes
- automatic comments for column moves
- automatic comments for approval action
- channel scoped board persistence using `channel_id`
- Refresh Board button
- development Discord app for preview testing
- dynamic board member syncing
- Assign to me and Unassign owner actions
- verified server session for write routes
- per user create rate limiting by verified Discord user id
- board import from JSON with in app confirmation
- board export to manual copy JSON modal
- board viewport scrolling inside the main content area
- system comment filter in the card modal

#### Changed
- To Do renamed to Backlog
- Done replaced with Approval workflow
- approved cards now use green styling and locked controls
- Summary tab no longer shows New Card button
- Back button hidden in Backlog
- comments box in modal now scrolls instead of expanding indefinitely
- cards now wrap long title and description text properly
- title and description lengths limited to prevent overflow
- system comments are hidden by default in the modal

#### Removed
- global only shared board behavior as the primary model
- Summary tab new card entry point
- client trusted actor identity for protected write actions
- automatic export download attempt as the primary Discord export flow

#### Important version 2 note
- preview and production currently share the same remote D1 database
- use the development Discord app only in dedicated test channels

## Maintainer Notes
If future you forget the setup order, do this:
1. make changes locally
2. test locally with Wrangler Pages dev
3. commit and push to the development branch
4. wait for Cloudflare preview deployment
5. test in browser
6. test in the Discord development app
7. only merge to `main` after production testing is complete
