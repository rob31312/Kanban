
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
- API routes for cards and Discord token exchange
- Shared server session helper in `client/functions/_lib/session.js`
- Card import and export API routes

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

The Backlog column also supports two states:
- active backlog item
- rejected

Approved cards are visually marked, locked down, and mostly read only.

Rejected cards remain in Backlog as a historical record so teams do not reinvent previously rejected ideas. Rejected cards are visually marked, locked down similar to approved cards, and can be reopened later if needed.

## Features
- Shared board inside Discord Activities
- Channel scoped persistence
- Approval workflow with pending approval and approved state
- Rejection workflow in Backlog with rejection reason support
- Audit trail comments with timestamps
- Automatic comments for field changes, column moves, and approval
- Owner, priority, comments, approval state, and rejection state persistence in D1
- Priority based card sorting in each column, High first, then Medium, then Low
- Oldest cards sort first inside the same priority group
- Approved and rejected cards sort to the bottom of their column
- Reopen action for rejected cards
- Separate production and development Discord apps
- Cloudflare preview deployment for development testing
- Verified server side write authentication using a signed Discord session cookie
- Create, update, delete, and reset routes now require authenticated server session
- Per user card creation rate limiting tied to verified Discord user id
- Dynamic board member syncing from Discord participants
- Assign to me and Unassign owner actions
- Import board from JSON with in app confirmation
- Export board through a manual copy JSON modal
- Board viewport scrolling inside the main content area
- Comments filter that can hide system comments
- Reject workflow for Backlog cards
- Reopen action for rejected cards
- Priority based column sorting with High, Medium, and Low active cards first
- Secondary sort by age with oldest cards first inside each priority group
- Approved and rejected terminal cards sorted to the bottom of their column
- Rejected state persistence in D1
- Board version polling for shared refresh detection
- Temporary board update banner showing which user changed the board
- Lightweight board state route and D1 table for auto refresh coordination
- Import and export includes rejected card fields

## Local Development

### Prerequisites
- Node.js installed
- npm installed
- Wrangler installed locally in the project or available through `npx`
- Cloudflare account and Pages project already configured
- D1 database already created and bound

### Important local note
Local Pages development uses a local D1 database unless you explicitly work against remote. Keep local and remote schema changes in sync.

### Local verified auth secrets
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
npx wrangler pages dev dist
```

Then open the local URL shown in the terminal, usually something like:

```text
http://localhost:8788
```

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

Check rejection columns and board sync table:

```bash
npx wrangler d1 execute discord-kanban-db --command "PRAGMA table_info(cards);"
npx wrangler d1 execute discord-kanban-db --command "SELECT sql FROM sqlite_master WHERE type='table' AND name='board_state';"
```

Create the board sync table remotely if needed:

```bash
npx wrangler d1 execute discord-kanban-db --remote --command "CREATE TABLE IF NOT EXISTS board_state (board_id TEXT PRIMARY KEY, version INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, updated_by_user_id TEXT, updated_by_name TEXT, last_action TEXT NOT NULL DEFAULT '');"
```

View approval and rejection fields:

```bash
npx wrangler d1 execute discord-kanban-db --command "SELECT id, title, status, priority, is_approved, is_rejected, rejection_reason, rejected_at FROM cards ORDER BY id ASC;"
```

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
- rejected cards remain in Backlog, sort to the bottom, and are intended to be historical unless reopened
- export in Discord currently uses a manual copy modal because automatic file download is not reliable in the embedded client

## How to Test the App

### Basic functional test
- create a new card
- edit title, description, owner, and priority
- add a comment
- use Assign to me and Unassign
- move the card through Backlog, In Progress, Testing, and Approval
- approve the card
- verify approved card styling and locked state
- move a Backlog card backward and confirm it offers Reject instead
- reject a card, enter a rejection reason, and verify it stays in Backlog as a locked historical card
- reopen a rejected card and confirm it becomes active again
- verify sorting in each column, High first, then Medium, then Low, with oldest first inside each priority group
- verify approved and rejected cards stay at the bottom of their column
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
3. Save the JSON manually as a `.json` file
4. Reset the board
5. Import the saved `.json` file
6. Confirm all cards return correctly

### Auth and security test
- verify the Discord status box shows authenticated user state
- create a card
- edit a card
- delete a card
- reset the board
- confirm these actions work only when authenticated
- confirm rate limiting still applies for repeated card creation

### Board sync test
1. Open the same channel board with two users
2. Make a card change with user A
3. Wait for the polling interval or observe the board update banner
4. Confirm user B sees the board refresh automatically without clicking Refresh Board
5. Confirm the banner shows which user updated the board

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
- for beta.3 and later, also verify board sync polling and the temporary update banner

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
- board sync polling in beta.3 depends on the `board_state` table existing in D1 and the `board-state` route being deployed

## Discord Notes
- production and development should use separate Discord apps
- development app should point to preview builds
- production app should stay pointed to production
- if Discord behaves strangely during testing, fully restarting or reinstalling Discord may help
- Discord may block automatic file download or clipboard APIs inside the embedded Activity
- board sync in beta.3 uses periodic polling rather than websocket push, which reduces risk inside the embedded Discord environment

## Known Behaviors and Troubleshooting

### Cards do not appear immediately
Use the `Refresh Board` button. The app also performs an automatic delayed reload after Discord initialization.

### Other user's update did not appear yet
Beta.3 adds automatic board polling, but updates may still appear on the next polling cycle rather than instantly. Use `Refresh Board` if needed during testing.

### Card says not found in this channel
This usually means older cards were created before channel scoping or under a different `channel_id`.

### Preview changes production data
Preview and production currently share the same remote D1 database. Use only dedicated test voice channels in the development app.

### White screen in Discord but not browser
This has previously been caused by Discord client issues rather than the app build. Fully restarting or reinstalling Discord resolved it.

### Export does not download a file automatically
This is expected in the current Discord embedded environment. Use the export modal and manually save the selected JSON to a `.json` file.

### Reject button not visible or sort order looks wrong
If you expect the Reject workflow or priority sorting and do not see it, verify the newest `client/src/App.jsx` was actually deployed and that the running build is not serving an older cached frontend.

### Import appears to do nothing
The current build uses an in app confirmation modal after selecting a file. Confirm the import there.

## Future Improvement Ideas
- split preview and production into separate D1 databases
- improve reset flow for channels
- additional admin safeguards
- add a separate immutable audit log table
- optional toggle to hide rejected cards by default
- optional direct browser based file export for non Discord use
- replace polling with websocket or other real time push if project scope allows

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
- Reject action in Backlog with rejection reason support
- Reopen action for rejected cards
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
- reject action in Backlog with rejection reason support
- rejected cards stay visible as locked historical cards in Backlog
- reopen action for rejected cards
- column sorting by priority with oldest first tie break
- approved and rejected cards sorted to the bottom of their columns
- rejected fields included in import and export

#### Changed
- To Do renamed to Backlog
- Done replaced with Approval workflow
- approved cards now use green styling and locked controls
- Summary tab no longer shows New Card button
- Back button in Backlog replaced by Reject
- comments box in modal now scrolls instead of expanding indefinitely
- cards now wrap long title and description text properly
- title and description lengths limited to prevent overflow
- system comments are hidden by default in the modal
- active cards now sort by priority, High then Medium then Low
- cards inside the same priority group now sort oldest first
- approved and rejected cards now sort to the bottom of their columns

#### Removed
- global only shared board behavior as the primary model
- Summary tab new card entry point
- client trusted actor identity for protected write actions

#### Important version 2 note
- preview and production currently share the same remote D1 database
- use the development Discord app only in dedicated test channels

### Version 2 Beta 3 Notes
- `Kanban v2.0.0-beta.3` adds lightweight board synchronization using polling
- all users in the same channel should receive automatic board refresh on the next polling cycle after a write action
- the temporary update banner should identify the user who made the latest detected change
- this version depends on the `board_state` table and the `board-state` API route being deployed together

## Maintainer Notes
If future you forget the setup order, do this:
1. make changes locally
2. test locally with Wrangler Pages dev
3. commit and push to the development branch
4. wait for Cloudflare preview deployment
5. test in browser
6. test in the Discord development app
7. only merge to `main` after production testing is complete
