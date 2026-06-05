# TaskOrbit License Verification Backend

A secure, lightweight API backend for managing, validating, and generating TaskOrbit Pro license keys. It uses **Node.js (Express)**, **SQLite3**, **JSON Web Tokens (JWT)**, and **express-rate-limit** to prevent brute-force attacks.

## Directory Structure
- `server.js`: Express server defining public verify and admin license endpoints.
- `database.js`: SQLite connection helper and schema initialization.
- `Dockerfile`: Minimal multi-stage container build definition.
- `docker-compose.yml`: Local orchestrator with persistent database storage.
- `test_api.js`: Integration test suite script.
- `.env.example`: Configuration template.
- `.env`: Live local configurations containing secure random keys.

---

## Configuration (`.env`)
The server reads configurations from a `.env` file. The file has been pre-configured with secure keys, but you can customize it:
- `PORT`: Port on which the API server listens (default: `3000`).
- `JWT_SECRET`: A secure signing key used to sign verified license tokens. **Change this to a private string.**
- `ADMIN_SECRET`: An authorization token sent in the `X-Admin-Secret` header for generation and revocation requests.
- `DB_PATH`: Path to the SQLite db file (defaults to `/data/licenses.db` in Docker).

---

## Deployment (Docker Compose)
To host the backend server on your remote Docker host:

1. Copy the `backend/` folder to your remote docker server.
2. Navigate to the `backend/` directory.
3. Build and launch the container in the background:
   ```bash
   docker compose up --build -d
   ```
4. The SQLite database will be created on the host in `./data/licenses.db` and is persisted across container updates/rebuilds.

---

## Verification & Testing
Once the server is up and running, you can run the built-in integration tests inside the container:
```bash
docker exec -it taskorbit-api node test_api.js
```
The test suite will verify:
- Server health (`/health`).
- Unauthenticated access prevention to admin routes.
- Key generation (`/v1/admin/license/generate`).
- Successful validation/verification (`/v1/license/verify`).
- Key revocation (`/v1/admin/license/revoke`).
- Re-verification block of revoked keys.

## Admin Control Center Dashboard
A secure, premium dashboard is served statically at `/admin/`.
- **Authentication**: Requires the `ADMIN_SECRET` key to enter.
- **Features**: Generates license keys (with optional email & name registration), searches/filters through all generated keys, displays active/revoked/expired status, copies keys to clipboard, and handles revocation on click.

---

## Admin License Management API

### 1. Generate License Keys
Generates one or more unique keys (`TO-XXXX-XXXX-XXXX`).
- **Endpoint**: `POST /v1/admin/license/generate`
- **Headers**:
  - `Content-Type: application/json`
  - `X-Admin-Secret: <YOUR_ADMIN_SECRET>`
- **Payload**:
  ```json
  {
    "tier": "PRO",
    "durationDays": 30, // 0 or null for lifetime access
    "count": 5,         // Number of keys to generate (1-100)
    "email": "client@example.com", // Optional: Associate client email
    "name": "John Doe"  // Optional: Associate client name
  }
  ```
- **Example Curl**:
  ```bash
  curl -X POST https://taskorbit.subho.net/v1/admin/license/generate \
    -H "Content-Type: application/json" \
    -H "X-Admin-Secret: YOUR_ADMIN_SECRET" \
    -d '{"tier": "PRO", "durationDays": 30, "count": 1, "email": "client@example.com", "name": "John Doe"}'
  ```

### 2. Revoke a License Key
Deactivates a license key instantly, preventing verification or silent renewals.
- **Endpoint**: `POST /v1/admin/license/revoke`
- **Headers**:
  - `Content-Type: application/json`
  - `X-Admin-Secret: <YOUR_ADMIN_SECRET>`
- **Payload**:
  ```json
  {
    "licenseKey": "TO-XXXX-XXXX-XXXX"
  }
  ```
- **Example Curl**:
  ```bash
  curl -X POST https://taskorbit.subho.net/v1/admin/license/revoke \
    -H "Content-Type: application/json" \
    -H "X-Admin-Secret: YOUR_ADMIN_SECRET" \
    -d '{"licenseKey": "TO-ABCD-1234-EFGH"}'
  ```

---

## Public Verification API

### Verify License Key
Validates a key and issues a signed 30-day JWT. If the key was generated with an associated email, the verification endpoint validates that the input email matches the registered email.
- **Endpoint**: `POST /v1/license/verify`
- **Headers**:
  - `Content-Type: application/json`
- **Payload**:
  ```json
  {
    "licenseKey": "TO-XXXX-XXXX-XXXX",
    "email": "client@example.com" // Required if the key was created with an email
  }
  ```
- **Example Curl**:
  ```bash
  curl -X POST https://taskorbit.subho.net/v1/license/verify \
    -H "Content-Type: application/json" \
    -d '{"licenseKey": "TO-YSF7-C721-GFWX", "email": "client@example.com"}'
  ```
