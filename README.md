# GitHub Profile Analyzer

A full-stack Node.js application that analyzes GitHub developer profiles via the GitHub REST API, stores enriched results in a MySQL database, and presents them through a premium, dark-themed dashboard. Compare developers side-by-side, sort and paginate through analyzed profiles, and see activity scores at a glance.

---

## Tech Stack

| Layer       | Technology                                                   |
| ----------- | ------------------------------------------------------------ |
| Runtime     | **Node.js** (>= 18)                                         |
| Framework   | **Express 4**                                                |
| Database    | **MySQL 2** (mysql2/promise driver)                          |
| HTTP Client | **Axios** (for GitHub API calls)                             |
| Security    | **Helmet** (HTTP security headers)                           |
| Logging     | **Morgan** (request logging)                                 |
| Rate Limit  | **express-rate-limit** (API abuse protection)                |
| Frontend    | Vanilla HTML, CSS, JavaScript — no frameworks                |

---

## Features

- **Profile Analysis** — Fetch any public GitHub user's profile, repos, and compute aggregated stats with a single API call.
- **Smart Caching** — Profiles are cached for 1 hour; re-analysis is skipped unless `?force=true` is passed.
- **Repository Insights** — Aggregated star count, fork count, and top programming language across all public repos.
- **Activity Scoring** — A 0–100 score based on followers, stars, and repo count (see formula below).
- **Compare Profiles** — View two developers' stats side-by-side with per-stat winner highlighting.
- **Pagination & Sorting** — Browse all profiles with sortable columns (followers, stars, repos, score) and paginated results.
- **Rate Limiting** — Configurable per-IP rate limiting to prevent abuse.
- **Dark Theme Dashboard** — Premium glassmorphism UI with a dark sidebar, smooth transitions, and fully responsive layout.
- **Render Deployment Ready** — Includes `render.yaml` for one-click deployment to Render.

---

## Prerequisites

| Requirement                         | Notes                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------ |
| **Node.js >= 18**                   | LTS recommended. Check with `node -v`.                                   |
| **MySQL Server**                    | 5.7+ or 8.x. Can be local, Docker, or a managed cloud instance.         |
| **GitHub Personal Access Token**    | *Optional but strongly recommended.* Without a token, the GitHub API limits you to 60 requests/hour. With a token you get 5,000/hour. Create one at [github.com/settings/tokens](https://github.com/settings/tokens) with `public_repo` scope. |

---

## Local Setup

```bash
# 1. Clone the repository
git clone https://github.com/your-username/github-profile-analyzer.git
cd github-profile-analyzer/github-analyzer

# 2. Install dependencies
npm install

# 3. Create your environment file
cp .env.example .env

# 4. Edit .env with your MySQL credentials and (optional) GitHub token
#    See the Environment Variables table below.

# 5. Initialize the database (creates tables)
npm run db:init

# 6. Start in development mode (auto-restarts on file changes)
npm run dev
```

The server starts at **http://localhost:3000** by default. Open it in your browser to see the dashboard.

---

## Environment Variables

| Variable         | Description                                      | Required | Default        |
| ---------------- | ------------------------------------------------ | -------- | -------------- |
| `PORT`           | Port the Express server listens on               | No       | `3000`         |
| `NODE_ENV`       | Environment mode (`development` / `production`)  | No       | `development`  |
| `DB_HOST`        | MySQL server hostname                            | Yes      | `localhost`    |
| `DB_PORT`        | MySQL server port                                | No       | `3306`         |
| `DB_USER`        | MySQL username                                   | Yes      | `root`         |
| `DB_PASSWORD`    | MySQL password                                   | Yes      | —              |
| `DB_NAME`        | MySQL database name                              | Yes      | `github_analyzer` |
| `GITHUB_TOKEN`   | GitHub Personal Access Token                     | No       | — (unauthenticated, 60 req/hr) |
| `CORS_ORIGIN`    | Allowed CORS origin(s)                           | No       | `*`            |
| `RATE_LIMIT_MAX` | Max API requests per IP per 15-minute window     | No       | `100`          |

---

## API Reference

### 1. Analyze a Profile

```
POST /api/profiles/analyze/:username
```

| Query Param | Type    | Description                             |
| ----------- | ------- | --------------------------------------- |
| `force`     | boolean | If `true`, bypass cache and re-analyze  |

**Response (200)**
```json
{
  "success": true,
  "cached": false,
  "data": {
    "username": "torvalds",
    "name": "Linus Torvalds",
    "avatar_url": "https://avatars.githubusercontent.com/u/1024025?v=4",
    "bio": null,
    "location": "Portland, OR",
    "company": "Linux Foundation",
    "public_repos": 7,
    "followers": 220000,
    "following": 0,
    "total_stars": 185000,
    "total_forks": 55000,
    "top_language": "C",
    "activity_score": 100,
    "analyzed_at": "2026-06-21T08:00:00.000Z"
  }
}
```

### 2. List All Profiles

```
GET /api/profiles
```

| Query Param | Type   | Default        | Description                                            |
| ----------- | ------ | -------------- | ------------------------------------------------------ |
| `sort`      | string | `analyzed_at`  | Sort field: `followers`, `total_stars`, `public_repos`, `activity_score`, `analyzed_at` |
| `order`     | string | `desc`         | `asc` or `desc`                                        |
| `page`      | number | `1`            | Page number                                            |
| `limit`     | number | `10`           | Results per page (max 100)                             |

**Response (200)**
```json
{
  "success": true,
  "data": [ { "username": "torvalds", "...": "..." } ],
  "page": 1,
  "totalPages": 3,
  "total": 25
}
```

### 3. Get Single Profile

```
GET /api/profiles/:username
```

**Response (200)**
```json
{
  "success": true,
  "data": { "username": "torvalds", "...": "..." }
}
```

**Response (404)**
```json
{
  "success": false,
  "error": "Profile not found"
}
```

### 4. Compare Profiles

```
GET /api/profiles/compare?users=torvalds,gaearon
```

| Query Param | Type   | Description                                  |
| ----------- | ------ | -------------------------------------------- |
| `users`     | string | Comma-separated list of exactly 2 usernames  |

**Response (200)**
```json
{
  "success": true,
  "data": [
    { "username": "torvalds", "followers": 220000, "...": "..." },
    { "username": "gaearon",  "followers": 80000,  "...": "..." }
  ]
}
```

### 5. Delete a Profile

```
DELETE /api/profiles/:username
```

**Response (200)**
```json
{
  "success": true,
  "message": "Profile deleted successfully"
}
```

### 6. Health Check

```
GET /health
```

**Response (200)**
```json
{
  "status": "ok",
  "timestamp": "2026-06-21T08:00:00.000Z"
}
```

---

## Activity Score Formula

The activity score is a number from **0 to 100** calculated as:

```
score = min(100, round(
    min(followers, 100) × 0.3
  + min(stars, 100)     × 0.4
  + min(repos, 50)      × 0.3
))
```

Each component is capped to prevent any single metric from dominating the score:

| Component   | Weight | Cap   | Max Contribution |
| ----------- | ------ | ----- | ---------------- |
| Followers   | 30%    | 100   | 30 points        |
| Total Stars | 40%    | 100   | 40 points        |
| Public Repos| 30%    | 50    | 15 points        |

> **Note:** The theoretical maximum is 85, but `min(100, ...)` allows for future formula additions without breaking the 0–100 contract.

---

## Frontend Dashboard

The dashboard is a single-page application served as static files from `public/`. It has four tabs:

1. **Analyze** — Enter a GitHub username and click "Analyze Profile" to fetch and display their stats, including avatar, bio, stats grid, and activity score badge.

2. **All Profiles** — Browse all previously analyzed profiles in a sortable, paginated table. Click "View" to open a modal with full details, or "Delete" to remove a profile.

3. **Compare** — Enter two usernames to compare side-by-side. Each stat is highlighted for the winner with a blue accent. The overall winner gets a trophy badge.

4. **Delete** — Enter a username and confirm deletion. Shows inline success/error messages.

The UI features a dark navy sidebar with a gradient, glassmorphism cards, smooth transitions, and is fully responsive down to 375px viewports.

---

## Deploying to Render

1. **Push your code** to a GitHub (or GitLab) repository.

2. **Create a MySQL database** on a managed service (e.g., PlanetScale, Railway, Aiven, or Render's own PostgreSQL + a MySQL add-on).

3. **Sign in to [Render](https://render.com)** and click **New → Blueprint**.

4. **Connect your repository.** Render will detect the `render.yaml` file automatically.

5. **Set your environment variables** in the Render dashboard:
   - `DB_HOST` — Your MySQL host
   - `DB_PORT` — Usually `3306`
   - `DB_USER` — Database username
   - `DB_PASSWORD` — Database password
   - `DB_NAME` — Database name
   - `GITHUB_TOKEN` — Your GitHub PAT (optional but recommended)

6. **Deploy.** Render will run `npm install` then `npm start`. The health check at `/health` confirms the service is running.

7. **Initialize the database.** On first deploy, either:
   - SSH into the service and run `npm run db:init`, or
   - Add `npm run db:init &&` before `npm start` in the `startCommand` for the initial deploy.

Your app will be available at `https://github-analyzer-xxxx.onrender.com`.

---

## Database Schema

The application uses two MySQL tables:

### `profiles`

| Column          | Type             | Description                            |
| --------------- | ---------------- | -------------------------------------- |
| `id`            | INT, PK, AUTO    | Internal row ID                        |
| `username`      | VARCHAR(255), UQ | GitHub username (unique)               |
| `github_id`     | INT              | GitHub's numeric user ID               |
| `name`          | VARCHAR(255)     | Display name                           |
| `avatar_url`    | TEXT             | Profile picture URL                    |
| `bio`           | TEXT             | User bio                               |
| `location`      | VARCHAR(255)     | Location                               |
| `company`       | VARCHAR(255)     | Company / organization                 |
| `public_repos`  | INT              | Number of public repositories          |
| `followers`     | INT              | Follower count                         |
| `following`     | INT              | Following count                        |
| `total_stars`   | INT              | Sum of stars across all public repos   |
| `total_forks`   | INT              | Sum of forks across all public repos   |
| `top_language`  | VARCHAR(100)     | Most frequently used language          |
| `activity_score`| INT              | Calculated 0–100 activity score        |
| `analyzed_at`   | DATETIME         | When the profile was last analyzed     |
| `created_at`    | DATETIME         | Row creation timestamp                 |
| `updated_at`    | DATETIME         | Row last-updated timestamp             |

### `repositories`

| Column          | Type             | Description                            |
| --------------- | ---------------- | -------------------------------------- |
| `id`            | INT, PK, AUTO    | Internal row ID                        |
| `profile_id`    | INT, FK          | References `profiles.id`               |
| `name`          | VARCHAR(255)     | Repository name                        |
| `full_name`     | VARCHAR(255)     | owner/repo full name                   |
| `description`   | TEXT             | Repository description                 |
| `language`      | VARCHAR(100)     | Primary language                       |
| `stars`         | INT              | Star count                             |
| `forks`         | INT              | Fork count                             |
| `open_issues`   | INT              | Open issue count                       |
| `is_fork`       | BOOLEAN          | Whether the repo is a fork             |
| `created_at`    | DATETIME         | Repo creation date on GitHub           |
| `updated_at`    | DATETIME         | Repo last-updated date on GitHub       |

---

## License

MIT © 2026
