# ZoomDrive

Roadside-help platform for South Africa. Drivers request help; verified providers accept and come to them.

## Prerequisites

Node.js 18.11 or later.

## Local Setup

### Windows PowerShell
```powershell
cd backend
npm install
cp .env.example .env
# Generate JWT_SECRET (32+ chars):
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
# Edit .env and set JWT_SECRET and other required variables
npm run dev
```

### Any shell (bash, zsh, Git Bash)
```bash
cd backend
npm install
cp .env.example .env
# Generate JWT_SECRET (32+ chars):
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
# Edit .env and set JWT_SECRET and other required variables
npm run dev
```

## Backend Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Start development server with hot reload |
| `npm start` | Start production server |
| `npm run check` | Run static checks (syntax, secrets, empty files, etc.) |
| `npm run migrate` | Run pending database migrations |
| `npm run schema:audit` | Compare migrations with live database |
| `npm run seed` | Seed services and settings |

## Environment Variables

See `.env.example` for variable names. See BLUEPRINT.md section 6 for detailed descriptions.

## Deployment

- **Backend**: Render, root directory `backend`
- **Frontend**: Vercel, root directory `frontend/public`

## Source of Truth

BLUEPRINT.md is the single source of truth for architecture, phases, and specifications.
