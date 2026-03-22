# Sprint Room

Sprint Room is a starter Discord Activity project for a small Agile team.
Version 1 includes a lightweight Kanban board and a Standup view.

## Features in this starter
- Four Kanban columns: To Do, In Progress, Testing, Done
- Create new tasks
- Edit task details in a modal
- Assign owners
- Move tasks between statuses with buttons
- Simple standup summary
- Discord Embedded App SDK starter hook

## Project structure
- `client/` frontend Activity app built with Vite
- `server/` placeholder Node server for future expansion

## Run locally

### Client
```bash
cd client
npm install
npm run dev
```

### Server
```bash
cd server
npm install
npm run dev
```

## Discord Activity setup
1. Create a Discord application in the Discord Developer Portal.
2. Enable Activities.
3. Add URL Mapping for your local tunnel URL.
4. Copy your Client ID into `client/.env` using `.env.example`.

## Environment variables
Create `client/.env` from `client/.env.example`

```bash
VITE_DISCORD_CLIENT_ID=your_client_id_here
```

## Suggested next steps
- Add drag and drop
- Add persistence
- Add GitHub issue or pull request links
- Add team member management
- Add Discord authenticated user names
