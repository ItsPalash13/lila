# Lila — Multiplayer Tic-Tac-Toe (Nakama)

Server-authoritative tic-tac-toe with React + TypeScript frontend and Nakama 3.x (JavaScript runtime). This repo maps to the **LILA full-stack assignment** rubric below.

## Demo


https://github.com/user-attachments/assets/374145cb-ebed-470a-aa73-53e254f64d40



---

## Assignment checklist

### Frontend

| Requirement | Status |
|-------------|--------|
| Preferred stack (React) | ✅ |
| Responsive UI (mobile-friendly breakpoints, touch targets) | ✅ |
| Real-time game state updates (WebSocket match data) | ✅ |
| Player information & match status (opponent name, phase, timed countdown) | ✅ |

### Backend (Nakama) — core

| Requirement | Status |
|-------------|--------|
| Server-authoritative game logic (authoritative match handler) | ✅ |
| Validate moves server-side (`matchLoop`) | ✅ |
| Prevent client cheating (state only from server snapshots) | ✅ |
| Broadcast validated state (op code 1 snapshots) | ✅ |
| Create game rooms (`create_tic_room` RPC + stable `match_id`) | ✅ |
| Automatic matchmaking (classic & timed pools) | ✅ |
| Join by match id + host flow | ✅ |
| Graceful disconnect / reconnect (forfeit, rejoin hint, resync opcode) | ✅ |
| **Deployment** (cloud Nakama + public frontend + deployment docs) | ✅ *See [Deployment](#deployment)* |

### Optional (bonus)

| Requirement | Status |
|-------------|--------|
| Concurrent games / room isolation (one match per `match_id`; many matches server-wide) | ✅ |
| Leaderboard (wins, losses, streaks, rating +4/−1, top 5, persistence) | ✅ |
| Timer mode (30s/turn, timeout forfeit, matchmaker `classic` vs `timed`, UI countdown) | ✅ |

### Deliverables

| Item | Status |
|------|--------|
| Source repository | ✅ (this repo) |
| Public game URL / mobile app | ✅ [Production frontend](https://lila-frontend-255488740752.asia-south1.run.app) |
| Public Nakama endpoint | ✅ [Production Nakama API](https://nakama-255488740752.asia-south1.run.app) (HTTPS / WSS) |
| README: setup & install | ✅ |
| README: architecture & design | ✅ |
| README: deployment process | ✅ *GCP Cloud Run — [Deployment](#deployment)* |
| README: API / server configuration | ✅ |
| README: how to test multiplayer | ✅ |

---

## Prerequisites

- **Node.js** 20+ (or compatible) for the frontend and Nakama runtime build  
- **Docker** + Docker Compose (for Postgres + Nakama locally)  
- **npm**  
- **Google Cloud SDK (`gcloud`)** — only if you redeploy or rebuild production images

---

## Quick start (local)

### 1. Nakama + Postgres

From the `nakama` folder:

```bash
cd nakama
docker compose up -d
```

- **HTTP / gRPC API:** `http://127.0.0.1:7350`  
- **Console (default):** `http://127.0.0.1:7351` — create a user or use device/email auth from the app  
- Default **server key** (dev): `defaultkey` (see Nakama docs if you change it)

### 2. Build the JavaScript runtime (required)

The container mounts [`nakama/runtime`](nakama/runtime) and loads [`local.yml`](nakama/local.yml) → `build/index.js`.

```bash
cd nakama/runtime
npm install
npm run build
```

Restart Nakama after runtime changes:

```bash
cd nakama
docker compose restart nakama
```

### 3. Frontend

```bash
cd frontend
cp .env.example .env
# Edit .env: VITE_NAKAMA_HOST, VITE_NAKAMA_PORT, VITE_NAKAMA_SERVER_KEY, VITE_NAKAMA_USE_SSL
npm install
npm run dev
```

Open the URL Vite prints (e.g. `http://localhost:5173`).

Production build:

```bash
npm run build
npm run preview   # optional local static test
```

---

## Architecture & design

```mermaid
flowchart TB
  subgraph client [React client]
    UI[SessionDashboard / TicTacToePanel]
    Socket[NakamaSocketContext]
    HTTP[nakama-js Client REST RPC]
  end
  subgraph nakama [Nakama]
    MM[Matchmaker]
    Match[tic_tac_toe authoritative match]
    RPC[RPC: create_tic_room tic_statistics ...]
    LB[Leaderboards + storage]
  end
  UI --> Socket
  UI --> HTTP
  Socket -->|WebSocket match join data| Match
  HTTP --> RPC
  MM -->|matchCreate| Match
  Match --> LB
```

- **Authoritative match** (`tic_tac_toe` in [`nakama/runtime/src/main.ts`](nakama/runtime/src/main.ts)): holds board, phase, turn, marks, timed deadlines; validates moves in `matchLoop`; sends JSON snapshots on op code **1**; moves on op code **2**; optional resync on op code **3**.  
- **Client** ([`frontend/src/nakama/NakamaSocketContext.tsx`](frontend/src/nakama/NakamaSocketContext.tsx)): matchmaker or `joinMatch(matchId)`; applies snapshots to React state; `createSocket(client.useSSL)` so an HTTPS-hosted app uses **WSS** (avoids mixed-content blocking).  
- **Rooms:** `create_tic_room` creates a match; host/guest join by id; quick match uses separate **classic** vs **timed** matchmaker queries.  
- **Persistence:** leaderboards (`tic_wins`, `tic_losses`, `tic_rating`), storage (`tic_stats` profile, `tic_match_log` history).  
- **Session:** short JWT + long refresh in [`nakama/local.yml`](nakama/local.yml); client restores session from `localStorage`.

---

## Configuration

| Setting | Location | Notes |
|--------|----------|--------|
| API key | `frontend/.env` → `VITE_NAKAMA_SERVER_KEY` | Must match Nakama `socket.server_key` / console |
| Host / port | `VITE_NAKAMA_HOST`, `VITE_NAKAMA_PORT` | Default `127.0.0.1` / `7350` |
| TLS | `VITE_NAKAMA_USE_SSL` | `true` when page and Nakama are both HTTPS/WSS |
| DB | `nakama/docker-compose.yml` | Postgres `nakama` / password `localdb` (local only) |
| Runtime bundle | `nakama/local.yml` | `runtime.path`, `js_entrypoint: build/index.js` |
| Matchmaker tick | `nakama/local.yml` | `matchmaker.interval_sec: 2` (local convenience) |

---

## Deployment

Production runs on **Google Cloud** (project **`lila-492319`**, region **`asia-south1`**): **Cloud Run** for Nakama and the static web UI, **Cloud SQL for PostgreSQL** for Nakama’s database, **Artifact Registry** for container images, and **Secret Manager** for the database password.

### Live URLs

| Service | URL |
|--------|-----|
| **Web app** (nginx + Vite build) | https://lila-frontend-255488740752.asia-south1.run.app |
| **Nakama** (API + WebSocket, TLS terminated by Cloud Run) | https://nakama-255488740752.asia-south1.run.app |

The browser client is built with **`VITE_NAKAMA_USE_SSL=true`**, **`VITE_NAKAMA_PORT=443`**, and the public Nakama hostname so traffic stays on **HTTPS / WSS**. The dev server key baked into that build is **`defaultkey`** (change Nakama’s key and rebuild the frontend if you lock this down).

### What runs where

1. **Nakama** — Custom image from [`nakama/Dockerfile`](nakama/Dockerfile) (TypeScript runtime compiled in the image). Cloud Run listens on container port **7350**. [`nakama/docker-entrypoint.sh`](nakama/docker-entrypoint.sh) runs migrations then starts Nakama; with **`CLOUDSQL_CONNECTION_NAME`** + **`POSTGRES_PASSWORD`** (from Secret Manager) it uses the Cloud SQL **Unix socket** (`/cloudsql/...`). **`min-instances: 1`** avoids dropping active sockets to zero scale.  
2. **Frontend** — Image from [`frontend/Dockerfile`](frontend/Dockerfile): `npm run build` then **nginx** on port **80**. [`frontend/cloudbuild.yaml`](frontend/cloudbuild.yaml) passes **`VITE_*`** build-args so the Nakama host/port/SSL match production.  
3. **Database** — Cloud SQL instance **`lila-nakama-db`**, database name **`nakama`**, attached to the Nakama revision via the Cloud Run **Cloud SQL connection** setting.

### Redeploy (from a machine with `gcloud` and project access)

```powershell
cd nakama
.\deploy-cloud-run.ps1
```

```powershell
cd frontend
.\deploy-cloud-run.ps1
```

Scripts default to project **`lila-492319`**, region **`asia-south1`**, and the Artifact Registry paths under `asia-south1-docker.pkg.dev/lila-492319/...`. Override with script parameters if you fork to another project or region. Nakama deploy expects Secret **`lila-nakama-postgres`** and IAM on the runtime service account (**Cloud SQL Client** + **Secret Accessor** on that secret).

### Security notes

- Do **not** commit **`.env`** files; local secrets stay local ([`nakama/.env.example`](nakama/.env.example) is a template only).  
- Treat **`defaultkey`** as public in the browser; for a serious production game, rotate Nakama’s server key and rebuild the frontend with matching **`VITE_NAKAMA_SERVER_KEY`**.  
- Restrict Nakama **7351** (console) in production if you expose it; the current public service is **7350**-only from the client’s perspective.

---

## How to test multiplayer (local)

1. Start **Docker Compose** and **runtime build** (see above), then **Vite dev server**.  
2. Open **two browser windows** (or normal + incognito) to the same app URL.  
3. Register/login as **two different users** (or two devices on the same LAN pointing at your machine’s IP in `.env`).  
4. **Quick match** — Both click *Quick match* (or *Quick match (timed)* for timed pool); wait for pairing (~2s interval locally).  
5. **Private room** — User A: *Create room* → share/copy **Room id** → User B: paste in *Match id to join* → *Join*.  
6. **Moves** — Only the active player’s clicks apply; observe board and status sync.  
7. **Disconnect** — Close one tab mid-game: other side should see win/forfeit per server rules.  
8. **Leaderboard / Statistics** — Play decisive games; open **Leaderboard** on home and **Statistics** from the avatar menu.

---

## Project layout

| Path | Role |
|------|------|
| [`frontend/`](frontend/) | Vite + React app |
| [`nakama/runtime/src/main.ts`](nakama/runtime/src/main.ts) | Match logic, RPCs, leaderboards |
| [`nakama/docker-compose.yml`](nakama/docker-compose.yml) | Local Postgres + Nakama |
| [`nakama/local.yml`](nakama/local.yml) | Nakama config (session, matchmaker, runtime path) |
| [`nakama/deploy-cloud-run.ps1`](nakama/deploy-cloud-run.ps1) | Build/push + Cloud Run deploy for Nakama |
| [`frontend/cloudbuild.yaml`](frontend/cloudbuild.yaml) | Cloud Build: Docker build with production `VITE_*` |
| [`frontend/deploy-cloud-run.ps1`](frontend/deploy-cloud-run.ps1) | Cloud Build + Cloud Run deploy for the web app |

---

## License

Provided for evaluation / assignment purposes unless otherwise specified by the author.
