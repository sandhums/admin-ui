# atrius-admin-ui

Hospital operations SPA — registration, scheduling, and visit start via **atrius-bff → his-server**.

Open in **Cursor/VS Code** alongside `atrius-bff` and `atrius-his` in [`atrius-hospital.code-workspace`](../atrius-hospital.code-workspace).

## Prerequisites

- Redis, Keycloak, Clinical HFS, **his-server** (`8096`), **atrius-bff** (`8084`)
- Foundation seed: `atrius-his/scripts/seed-hospital-foundation.py`

## Run

```bash
```bash
# Terminal 1 — BFF (local Keycloak :8443, default config)
cd ../atrius-bff
cargo run

# Terminal 2 — admin UI
cd atrius-admin-ui
npm install
npm run dev
```

Open **http://localhost:5174** (use `localhost`, not `127.0.0.1`, for cookie compatibility with BFF).

## Flow

1. **Register patient** → `POST /bff/his/patients`
2. **Find slot + book** → `GET /bff/his/slots`, `POST /bff/his/appointments`
3. **Start visit** → `POST /bff/his/encounters/start-visit`
4. **Billing desk** (`/billing`) — charges / cash invoice (needs `billing:read`; front desk has this after BFF migration `005_front_desk_billing`)

Open **http://localhost:5174/login** → sign in as **`frontdesk.demo`** / **`demo`** before using OPD booking.

Optional **Staff sign in** is required when BFF `authz_enforce = true` (default in dev).

Requires Keycloak client **`atrius-admin-bff`** in `deploy/keycloak/realm.json` (re-import Keycloak after realm changes — see `deploy/keycloak/README.md`).

HIS API calls use the BFF service token (`his-backend-client`) upstream.

## Config

| Variable | Default |
|----------|---------|
| `VITE_BFF_URL` | `""` (Vite proxy → `http://localhost:8084`) |

BFF HIS settings: `his_api_base`, `his_default_tenant`, `his_backend_client_*` in `atrius-bff/config/dev*.toml`.

## Related

- [atrius-his README](../atrius-his/README.md) — domain APIs and smoke scripts
- [atrius-clinical-ui](../atrius-clinical-ui) — clinician SMART launch (separate workspace recommended)
