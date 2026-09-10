# Crohnoz Fresh Market · Backend Prototype

**L1 · Prototype / R&D · Django / DRF operational boundary**

This backend exists to validate which Fresh Market workflows require a real server-side trust boundary instead of relying on browser state. It is intentionally narrower than the complete product concept and should not be interpreted as a production deployment claim.

## What it demonstrates

- Django 5.2 LTS + Django REST Framework 3.16;
- PostgreSQL-ready deployment with SQLite for local development and fast CI;
- organization-scoped operations via `X-Organization-ID`;
- roles: `owner`, `manager`, `operator`, `viewer`;
- append-only audit events with HMAC-SHA256 chaining;
- append-only inventory movement ledger;
- optimistic concurrency through `If-Match` on operational mutations;
- idempotency for orders, receiving, inventory movements and state transitions;
- explicit server-side workflow validation;
- exact CORS allowlisting and HTTPS-only remote API configuration;
- managed health checks and reproducible migrations.

## Current trust boundary

The prototype introduces a server boundary for selected workflows, but the wider Fresh Market product remains L1.

Current authentication is intentionally transitional. The implementation uses finite server-side tokens and rotates the previous token on login. Before any production claim, authentication and account lifecycle would need a production-grade design such as rotating JWT/OIDC, recovery flows, session policy and stronger operational monitoring.

## Local development

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py runserver 8001
```

The repository does not load real secrets automatically. Local or managed environments are responsible for securely providing configuration.

## Seed a fictitious test organization

The existing command name `seed_pilot` is retained as an internal implementation identifier. It creates **generic fictitious role accounts**, not client identities.

```bash
export PILOT_MANAGER_PASSWORD='unique-test-password-at-least-12-chars'
export PILOT_OPERATOR_PASSWORD='another-unique-test-password-12-chars'
python manage.py seed_pilot
```

PowerShell:

```powershell
$env:PILOT_MANAGER_PASSWORD="unique-test-password-at-least-12-chars"
$env:PILOT_OPERATOR_PASSWORD="another-unique-test-password-12-chars"
python manage.py seed_pilot
```

The command is idempotent and:

- creates or updates a fictitious organization;
- creates separate `manager` and `operator` accounts;
- loads a small fictitious catalog;
- requires explicit passwords;
- never prints passwords.

## PostgreSQL / managed deployment

```bash
cd backend
docker compose up --build
```

Local API:

- health: `http://localhost:8001/api/v1/health/`
- admin: `http://localhost:8001/admin/`

`render.yaml` defines an isolated web service and PostgreSQL database, a health check, migration/build flow and non-synchronized password variables for the two generic test roles.

## Core endpoints

- `GET /api/v1/health/`
- `POST /api/v1/auth/login/`
- `POST /api/v1/auth/logout/`
- `GET /api/v1/me/`
- `GET /api/v1/connection-summary/`
- `GET /api/v1/organizations/`
- `GET /api/v1/products/?is_active=true`
- `GET /api/v1/inventory-lots/`
- `POST /api/v1/inventory-lots/receive/`
- `GET /api/v1/inventory-movements/`
- `POST /api/v1/inventory-movements/`
- `GET` / `POST /api/v1/orders/`
- `POST /api/v1/orders/{id}/start-preparing/`
- `POST /api/v1/orders/{id}/confirm-weighing/`
- `POST /api/v1/orders/{id}/mark-ready/`
- `GET /api/v1/audit-events/` for `manager` and `owner`

## Inventory integrity

Receiving requires an `Idempotency-Key`. Inventory mutations require both:

```text
If-Match: <lot-version>
Idempotency-Key: <stable-request-key>
```

The backend rejects negative inventory, invalid units, stale versions and unsafe cross-request idempotency reuse. Generic `PATCH` / `DELETE` operations are intentionally blocked for ledger-style movement records.

### FEFO validation

Before consumption, the server resolves the first usable lot by availability, quality, preferred date, receiving date and deterministic tie-breaking. Attempting to consume a later lot is rejected while an earlier eligible lot remains available.

The current version does not automatically distribute one requested quantity across multiple lots; separate movements are recorded instead.

## Order lifecycle

Remote orders use explicit transitions rather than unrestricted CRUD:

`confirmed → preparing → ready`

The server controls initial state, validates complete weighing before readiness, recalculates totals server-side and requires concurrency/idempotency controls for state transitions.

## Security controls

- login throttling;
- finite token expiry;
- token rotation on login and deletion on logout;
- HTTPS-only remote endpoints except localhost development;
- passwords are never persisted in the browser;
- exact CORS allowlist;
- membership and role revalidation per request;
- no silent fallback from remote mode to local mode;
- transactional critical mutations;
- secrets excluded from the repository.

## Current limits

This backend is evidence of engineering direction, not production maturity.

- the managed instance still needs independent operational verification before being treated as a live pilot;
- only selected inventory and order workflows are server-backed;
- there is no complete bidirectional/offline synchronization;
- payment, credit, delivery and day-closing are not fully remote;
- account recovery and formal session lifecycle are incomplete;
- provider backup policy must be verified operationally;
- CSP should be restricted to the final deployed hostname;
- real personal/customer data should not be used in this phase.

`L0 IDEA → ● L1 PROTOTYPE → L2 PILOT → L3 PRODUCTION → L4 SCALE`

The maturity label moves only when evidence supports it.
