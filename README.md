# Amici Backend v2

Express API with PostgreSQL, JWT auth, Google Places/Geocoding, and S3 image storage.

## Setup

```bash
nvm use 24
cp .env.example .env   # fill in your keys
npm install
npm run db:migrate
npm run dev
```

Runs on **http://localhost:3001**

## Environment

| Variable | Description |
|----------|-------------|
| `GOOGLE_API` | Google Maps/Places/Geocoding API key |
| `POSTGRES_*` | PostgreSQL connection |
| `S3_*` | AWS S3 bucket for images |
| `JWT_SECRET` / `JWT_REFRESH_SECRET` | Token signing keys |
| `JWT_EXPIRATION` / `JWT_REFRESH_EXPIRATION` | Token lifetimes |

## Database Entities

- **users** — nickname, first_name, last_name, password, avatar
- **images** — S3-stored photos linked to users
- **pins** — geo-located posts with Google place data
- **comments** — text + 1-5 star rating
- **reactions** — funny, awful, scare, love, wow, meh
- **user_relations** — friend requests (pending/accepted/blocked)
- **user_ranks** — cached leaderboard scores & positions

## API

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | — | Register with nickname, name, password |
| POST | `/api/auth/login` | — | Login |
| POST | `/api/auth/refresh` | — | Refresh access token |
| POST | `/api/auth/logout` | JWT | Logout |
| GET | `/api/auth/me` | JWT | Current user |
| GET | `/api/geo/reverse` | — | Reverse geocode lat/lng |
| GET | `/api/geo/autocomplete` | — | Google Places autocomplete |
| GET | `/api/geo/place/:id` | — | Place details |
| GET | `/api/geo/nearby` | — | Nearby places |
| GET/POST | `/api/pins` | JWT for POST | List / create pins |
| GET | `/api/pins/:id` | — | Pin detail |
| POST | `/api/pins/:id/comments` | JWT | Add comment |
| POST | `/api/pins/:id/reactions` | JWT | Toggle reaction |
| GET | `/api/heatmap` | — | Heatmap data |
| GET | `/api/users/leaderboard` | — | Leaderboard |
| GET | `/api/relations/friends` | JWT | Friends list |
| POST | `/api/relations/request` | JWT | Send friend request |
