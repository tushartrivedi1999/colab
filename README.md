# Heat Relief GeoPlatform

A production-oriented, GIS-first platform to map, verify, and monitor heat-relief services (water points, ORS centers, shade shelters) with role-based workflows, geospatial analytics, and mobile readiness.

---

## 1) Project Overview

Heat Relief GeoPlatform is a full-stack application designed for emergency response teams, providers, and municipal administrators who need a reliable way to:

- discover nearby heat-relief centers,
- submit and review new service locations,
- track usage counts over time,
- monitor operational metrics from an admin dashboard,
- run the same product on web + mobile (Android/iOS) using Capacitor.

It combines **Next.js (frontend)**, **Express (backend)**, and **PostgreSQL + PostGIS (database)** for scalable spatial operations and secure API workflows.

---

## 2) Features

### Core GIS + Operations

- Interactive Mapbox-based map UI with modern controls.
- Location proposals with lat/lng picker.
- Status lifecycle: `pending` → `approved` / `rejected`.
- Spatial queries powered by PostGIS.
- Usage tracking per location (`+1` manual + optional QR flow).
- Daily/weekly aggregation for admin analytics.

### Security + Access

- JWT-based auth (`register`, `login`, `profile`).
- Role-based access (`admin`, `sub-admin`, `provider`).
- Email encryption at rest + deterministic email hash lookup.
- Helmet security headers + CORS allowlist + rate limiting.
- HTTPS enforcement support for production.

### Admin + Data

- Admin dashboard (map + filters + usage charting).
- User management (view/update roles).
- CSV/XLS export API.

### Mobile + Offline

- Capacitor support for Android and iOS.
- GPS integration.
- QR scanner integration.
- Offline caching for app assets + map tiles via service worker.

---

## 3) Tech Stack

### Frontend
- **Next.js 15** + **React 19** + **TypeScript**
- **TailwindCSS**
- **Mapbox GL JS**
- **Recharts**
- **CapacitorJS** + native plugins

### Backend
- **Node.js** + **Express** + **TypeScript**
- **PostgreSQL client (pg)**
- **JWT**, **bcrypt**
- **Zod** for env and payload validation
- **Helmet**, **CORS**, **Rate limiting**, **HPP**

### Database
- **PostgreSQL 15+**
- **PostGIS extension**

---

## 4) Installation Guide (Step-by-step)

> Repository is structured as a workspace with:
>
> - `backend/`
> - `frontend/`

### Step 0: Prerequisites

- Node.js **20+**
- npm **10+**
- PostgreSQL **15+**
- PostGIS extension package

---

## LOCAL SETUP

### Step 1: Install Node.js

#### Ubuntu
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v
npm -v
```

#### macOS (Homebrew)
```bash
brew install node@20
node -v
npm -v
```

#### Windows
- Install from: https://nodejs.org/
- Verify:
```powershell
node -v
npm -v
```

### Step 2: Install PostgreSQL + PostGIS

#### Ubuntu
```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib postgis
```

#### macOS
```bash
brew install postgresql postgis
```

#### Windows
- Install PostgreSQL from official installer.
- Install PostGIS using StackBuilder.

### Step 3: Create database

```bash
sudo -u postgres psql
```

Inside `psql`:
```sql
CREATE DATABASE heat_relief;
CREATE USER heat_user WITH ENCRYPTED PASSWORD 'change_me';
GRANT ALL PRIVILEGES ON DATABASE heat_relief TO heat_user;
\q
```

### Step 4: Setup environment variables

#### Backend
```bash
cd backend
cp .env.example .env
```

Update `backend/.env` values (important keys):

- `DATABASE_URL`
- `JWT_SECRET`
- `EMAIL_ENCRYPTION_KEY`
- `CORS_ORIGIN`
- `FORCE_HTTPS`

#### Frontend
```bash
cd ../frontend
cp .env.example .env.local
```

Set:
- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_MAPBOX_TOKEN`

### Step 5: Install dependencies

From project root:
```bash
npm install
```

Or install per package:
```bash
cd backend && npm install
cd ../frontend && npm install
```

### Step 6: Run backend

```bash
cd backend
npm run db:init
npm run dev
```

### Step 7: Run frontend

```bash
cd frontend
npm run dev
```

Frontend default URL: `http://localhost:3000`  
Backend default URL: `http://localhost:4000/api/v1`

---

## DATABASE SETUP

### कैसे PostGIS enable करें

`psql` में database connect करके:

```sql
\c heat_relief
CREATE EXTENSION IF NOT EXISTS postgis;
SELECT postgis_full_version();
```

### Tables create करने के SQL commands

You can run all schema SQL via:

```bash
cd backend
npm run db:init
```

Or manually run key SQL commands:

```sql
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_encrypted TEXT NOT NULL,
  email_hash TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'provider',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('water', 'ors', 'shade')),
  description TEXT NOT NULL,
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  provider_id UUID REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by UUID REFERENCES users(id),
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_locations_geo ON locations USING GIST ((location::geometry));

CREATE TABLE IF NOT EXISTS location_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('manual', 'qr')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## RUNNING PROJECT

### Workspace commands

```bash
npm install
npm run dev
```

### Individual services

```bash
# Backend
cd backend && npm run dev

# Frontend (new terminal)
cd frontend && npm run dev
```

---

## DEPLOYMENT (PRODUCTION)

## Option 1: VPS (Ubuntu)

### 1) Install Node.js + Nginx + PM2

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs nginx
sudo npm install -g pm2
```

### 2) Build app

```bash
# backend
cd backend
npm ci
npm run build

# frontend
cd ../frontend
npm ci
npm run build
```

### 3) Run backend with PM2

```bash
cd ../backend
pm2 start dist/server.js --name heat-relief-api
pm2 save
pm2 startup
```

### 4) Setup Nginx reverse proxy

Example `/etc/nginx/sites-available/heat-relief`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location /api/ {
        proxy_pass http://127.0.0.1:4000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable config:

```bash
sudo ln -s /etc/nginx/sites-available/heat-relief /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 5) SSL using Let’s Encrypt

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

---

## Option 2: Cloud (AWS / GCP)

### Architecture recommendation

- Frontend: Vercel / Cloud Run / ECS Fargate
- Backend API: ECS / EC2 / Cloud Run / App Engine
- DB: Managed PostgreSQL (RDS / Cloud SQL) + PostGIS enabled
- Secrets: AWS Secrets Manager / GCP Secret Manager

### High-level AWS steps

1. Provision RDS PostgreSQL.
2. Enable PostGIS on DB.
3. Deploy backend container to ECS/EC2.
4. Deploy frontend to Vercel or ECS.
5. Configure ALB + HTTPS + custom domain.
6. Set environment variables in service/task definition.

### High-level GCP steps

1. Provision Cloud SQL PostgreSQL.
2. Enable PostGIS extension.
3. Deploy backend to Cloud Run.
4. Deploy frontend to Cloud Run / Firebase Hosting / Vercel.
5. Configure HTTPS and domain mapping.
6. Set env vars via Cloud Run service config.

### Database hosting notes

- Use private networking/VPC where possible.
- Restrict inbound CIDRs.
- Enable automated backups + PITR.
- Tune connection pooling.

### Environment variables in cloud

Set at deployment platform level (not in repo):

- `DATABASE_URL`
- `JWT_SECRET`
- `EMAIL_ENCRYPTION_KEY`
- `CORS_ORIGIN`
- `FORCE_HTTPS=true`
- `NEXT_PUBLIC_API_BASE_URL`
- `NEXT_PUBLIC_MAPBOX_TOKEN`

---

## MOBILE BUILD (Capacitor)

From `frontend/`:

```bash
npm install
npx cap add android
npx cap add ios
npm run cap:build
npm run cap:android
npm run cap:ios
```

Manual equivalent:

```bash
npm run build
npx cap sync
npx cap open android
npx cap open ios
```

---

## SECURITY: Best Practices

- Always run production behind HTTPS (`FORCE_HTTPS=true`).
- Use strong secrets (`JWT_SECRET` 32+ chars, random).
- Rotate credentials periodically.
- Keep `CORS_ORIGIN` strict (specific domains only).
- Enable DB SSL (`DATABASE_SSL_ENABLED=true`) in production.
- Keep dependencies updated (`npm audit`, scheduled updates).
- Restrict DB user permissions to minimum required.
- Monitor rate-limit violations and error spikes.
- Store secrets in a secrets manager, never commit `.env` files.
- Add centralized monitoring (CloudWatch / Stackdriver / ELK / Grafana).

---

## Troubleshooting

### 1) `next: not found` / build fails
- Run `npm install` in root or in `frontend/`.
- Ensure Node.js version is compatible.

### 2) Database connection error
- Verify `DATABASE_URL`.
- Ensure PostgreSQL service is running.
- Confirm network/firewall access for DB host.

### 3) `permission denied for extension postgis`
- Use a DB superuser or managed DB admin role to enable extension.

### 4) `CORS policy denied this origin`
- Add the exact frontend origin in `CORS_ORIGIN` (comma-separated for multiple).

### 5) `HTTPS is required`
- Set up reverse proxy to forward `X-Forwarded-Proto=https`.
- Or disable locally with `FORCE_HTTPS=false` in development.

### 6) Invalid JWT / unauthorized
- Confirm token is current and signed with active `JWT_SECRET`.
- Ensure request header format is `Authorization: Bearer <token>`.

### 7) Mobile build issues (Capacitor)
- Run `npx cap sync` after dependency/config changes.
- Check Android Studio/Xcode SDK and signing configs.

---

## Project Credits

This project is developed by **BHARATTECH** by using **Rivinity Ai** in collaboration with **DR.Kasif Imdad**.

