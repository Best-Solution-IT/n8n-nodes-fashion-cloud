# Fashion Cloud node vs. API v2 spec — review and status

**Status as of 2026-09-30 (commit `5998969`):** every endpoint in the spec is implemented, and every finding
from the original review has been resolved. What remains is release setup (GitHub move, npm publishing)
and checks that need a real API token. See [Open points](#6-open-points).

The original review compared the node at commit `33db456` (2026-03-25) with
[`fashion-cloud-api-v2.json`](fashion-cloud-api-v2.json) (OpenAPI 3.0.3, 6 operations). The findings below
keep their original numbering so they can still be traced.

## 1. Coverage

| Endpoint | Spec operation | At review | Now |
|---|---|---|---|
| `GET /v2/brands` | List Brands | Implemented, with flaws | ✅ Brand → Get Many |
| `GET /v2/products` | List Products | Implemented, with flaws | ✅ Product → Get Many |
| `GET /v2/products/media/images/{id}` | Load Product Image | Implemented, **broken** | ✅ Product → Get Image |
| `GET /v2/products/prices/` | GET Product prices | **Missing** | ✅ Price → Get Many |
| `GET /v2/products/{gtin}/stock` | GET Product's Stock | **Missing** | ✅ Product → Get Stock |
| `POST /v2/orders` | POST Order (endless aisle) | **Missing** | ✅ Order → Create |

Authentication matched the spec from the start: the token is sent as the `token` query parameter.

### Code layout

| Path | Contents |
|---|---|
| `nodes/FashionCloud/FashionCloud.node.ts` | Node definition, brand dropdown, dispatch to the operations |
| `nodes/FashionCloud/descriptions/*Description.ts` | UI fields, one file per resource |
| `nodes/FashionCloud/actions/*.ts` | Operation logic, one file per resource; `index.ts` maps resource/operation to code |
| `nodes/FashionCloud/GenericFunctions.ts` | Requests, Base URL, error mapping, pagination, date conversion |
| `credentials/FashionCloudApi.credentials.ts` | API token, Base URL, credential test |
| `test/` | Vitest suite and an in-memory fake of the API |

## 2. Original findings and how they were resolved

### 2.1 Image download was broken (critical) — ✅ resolved
| Finding | Resolution |
|---|---|
| Binary JPEG was requested as JSON and put into `json` | Downloaded as binary (`encoding: 'arraybuffer'`) into a configurable binary field (default `data`), file name `<imageId>[_<px>].jpg`. The operation is now *Product → Get Image*. |
| `id` was labelled "Product ID" | Now "Image ID", described as the `_id` from a product's `media.images` |
| `px` was a free number | Dropdown: 200 / 512 / 1024 px; not set = original size |
| `watermark` was a text field | Boolean; the description explains the e-commerce permission requirement |
| `minAcceptableSize` was described as bytes | Dropdown: 200 / 512 / 1024 px. Rejected without `px`, before any request. |

### 2.2 List responses not unwrapped, no pagination (high) — ✅ resolved
- Every list operation outputs one item per entry of `data`.
- Return All / Limit on all list operations: offset pagination for brands (200 per page), `nextId` cursor for products (1000 per page) and prices (200 per page).
- Pagination stops once `totalElements` entries were collected, on an empty page, or when no new cursor is returned. A short page alone doesn't end it (see 2.9). It requests only as many entries as are still needed.

### 2.3 Product → Get Many filters and descriptions (high) — ✅ resolved
| Finding | Resolution |
|---|---|
| Brand/GTIN/article number all optional, so the default setup failed | Brand dropdown plus a "Product Filter" choice (None / GTIN / Article Number). GTIN and article number can't be combined. Missing filters are rejected before any request. |
| Brand needed an ID from `/brands` | Dropdown loaded from `GET /v2/brands` (all pages, sorted by name); an ID can still be given by expression |
| Wrong season values | Dropdown: Fall/Winter, Spring/Summer, NOS, No Season Assigned |
| `seasonYear` had the wrong type | String; the description notes it's ignored for NOS |
| `includePreliminary` described as products | Now "Include Preliminary Images" |
| README note about an upstream typo | Removed; the note was wrong |
| `lang` was free text | Dropdown with the 26 languages documented by Fashion Cloud, default German (commit `dc0b587`) |
| Limit defaults/maximums | Default 50; any limit works because pagination fetches pages at the allowed size |
| `updatedSince` without a timezone | Converted to ISO 8601 UTC; values without a timezone use the workflow timezone (DST-aware) |

### 2.4 Brand → Get Many (medium) — ✅ resolved
Return All / Limit with offset pagination (200 per page), items unwrapped, optional GLN filter.

### 2.5 Error handling (medium) — ✅ resolved
- API errors become `NodeApiError` with the HTTP status, and the Fashion Cloud `type`, `message` and every `errors[]` entry in the description. Examples:
  - `ValidationError: … - Field should be present (field=clientId, type=isNotPresent)`
  - `OrderingProcessError: … (orderedQuantity=1000, availableQuantity=120, gtin=…)`
- Error bodies of binary requests (image 404) are parsed too.
- With Continue On Fail, failing items output `{ error, description }` and the remaining items are still processed.
- Input problems (missing filters, invalid dates, invalid order data) raise `NodeOperationError` before any request.

### 2.6 Credential (medium) — ✅ resolved
- Credential test: `GET /v2/brands?limit=1`.
- `documentationUrl` points to Fashion Cloud's API documentation.
- **Base URL** field, defaulting to `https://api.fashion.cloud`, used by all requests and the credential test, e.g. to test against a mock server (commit `b6ecc10`). Credentials saved before the field existed keep using the Fashion Cloud API. Invalid values are rejected before the token is sent anywhere: anything that isn't an http(s) URL, URLs with a user name, password, query or fragment, and `http://` for hosts that aren't local (see 2.9).

### 2.7 n8n conventions (low) — ✅ resolved
- Singular resources (`brand`, `order`, `price`, `product`) and the standard `getAll` / "Get Many" naming.
- Subtitle shows operation and resource.
- `usableAsTool: true`; n8n adds a "Fashion Cloud Tool" variant for AI agents.
- Image download moved under Product.
- Light and dark icons for node and credential, plus a codex file (category "Sales").

### 2.8 Package and tooling (blocked publishing) — ✅ resolved
- Migrated to n8n's official `@n8n/node-cli`: build, lint, dev mode and release (commit `9a377a1`).
  - Strict mode with the default lint config, so the package is eligible for n8n Cloud verification.
  - Requires Node.js 24+ locally (tested with 24 and 26).
- GitHub Actions workflows: `ci.yml` runs lint, tests with coverage and the build on every pull request; `publish.yml` runs the tests and publishes to npm with provenance, as n8n requires since May 2026.
- Placeholder metadata replaced. `index.ts` and the copy script removed (the CLI copies icons). `.gitignore` cleaned up.
- **Tests:** 175 tests in `test/` (Vitest). Coverage is ~99% of lines and ~94% of branches, with thresholds so it can't silently drop (commit `6a2af46`).
- Package renamed to `n8n-nodes-fashion-cloud`, the usual style for two-word brands (commit `5998969`).

### 2.9 Security review (2026-09-30) — ✅ resolved
A later review ran the node in n8n 2.41.4 against a mock API. Each finding was reproduced there first and checked again after the fix.

| Finding | Resolution |
|---|---|
| **Test Order failed open (high).** An expression that resolved to nothing dropped `isTest` from the body, also from a JSON body that contained `"isTest": true`, so a real order was placed. | Only `true` / `false` (also as text) are accepted. Anything else raises an error before any request. |
| **Product filter silently dropped.** With Product Filter set to GTIN or Article Number and an empty value, the request listed the whole brand. | The value is trimmed; an empty one is rejected before any request. |
| **Pagination could truncate.** A page shorter than the requested limit ended paging even though more data existed. | A short page ends paging only when `totalElements` confirms everything was collected. Otherwise `nextId` (or the offset) is followed until it runs out. Whether the real API returns short pages is still unverified. |
| **`..` as GTIN or Image ID reached another endpoint** (`/v2/stock`, `/v2/products/media/`), because dots aren't URL-encoded. | Get Stock accepts digits only. Image IDs may contain letters, digits, `-`, `_` and `.`, but not only dots. The ID is also used in the file name. |
| **API errors didn't say which item failed.** Re-wrapping a `NodeApiError` ignores `itemIndex`. | The index is set on the error itself. |
| **"Updated Since" was off by an hour around clock changes**, e.g. Europe/Berlin `2024-10-27T01:30` became `00:30Z` instead of `23:30Z` the day before. | Both offsets around a clock change are tried. A time that occurs twice or not at all resolves to the earlier instant, so no updates are skipped. `Date` objects are accepted. |
| **The token could travel unencrypted.** The Base URL accepted `http://` for any host. | `http://` is only accepted for local hosts (loopback, `host.docker.internal`, private IP addresses, single-label names). The credential's `authenticate` is now a function that enforces this for the node, the credential test and the HTTP Request node alike. |
| **Base URL errors repeated the entered value**, which could be a token pasted into the wrong field. URLs with a user name, password, query or fragment were accepted. | The value is no longer repeated; such URLs are rejected. |
| **Release and dev setup.** Actions pinned to tags; dev n8n published on all interfaces; `dist/tsconfig.tsbuildinfo` shipped in the package (233 of 341 kB). | Actions are pinned to commit SHAs (v4.4.0 of `checkout` and `setup-node`); the dev port binds to `127.0.0.1`; the build cache is excluded via `files` in `package.json`. |

Checked and found in order: the token doesn't appear in execution error data (401, 500, 502, connection refused, DNS failure) or in Continue On Fail output.

## 3. Missing functionality — ✅ implemented (commit `5f3f3ab`)

| Operation | Implementation notes |
|---|---|
| Price → Get Many | Brand required (dropdown). Options: GTINs, Updated Since, Start After ID. Return All via `nextId` (200 per page). Uses the documented trailing slash `/v2/products/prices/`. |
| Product → Get Stock | One GTIN per request (URL-encoded); the GTIN is added to the output because the response doesn't contain it |
| Order → Create | See below |

**Order → Create:**
- Built from fields (client ID, debitor GLN, products, shipping address, plus optional billing address, debitor details, end customer and dropshipping) or sent as a complete JSON body.
- Products can be defined in the UI or passed as a JSON array, e.g. from a previous node.
- Sent with `type: "endless-aisle"` and `clientType: "erp"`, as the spec requires for external clients.
- **Test Order is on by default.** The toggle also overrides `isTest` in a JSON body, so a copied body can't place a real order by accident.
- A notice in the node warns against Retry On Fail, because creating an order isn't idempotent.
- Checked before sending: required shipping fields, 1–1000 products, non-empty GTINs, whole-number quantities of at least 1, valid JSON.

## 4. Decisions that differ from the original suggestions

| Suggestion | Decision | Reason |
|---|---|---|
| Cap Limit at the API maximum | No cap | Pagination fetches pages at the allowed size, so larger limits work |
| Keep `offset` for products (deprecated) | Replaced by "Start After ID" | The spec discourages `offset`; the cursor is the recommended way to resume |
| "Simplify / include metadata" toggle | Not added | Nothing needed `totalElements` so far |
| `resourceLocator` for brands | `options` dropdown with `loadOptions` | Simpler; an ID can still be given by expression |
| Order type selectable | Fixed to `endless-aisle` | The spec describes `b2b-order` as internal to Fashion Cloud |

## 5. Verification

- **Automated:** 175 Vitest tests against an in-memory fake API that follows the spec (limits, pagination, required filters, documented error bodies). Every request is recorded, so tests check exact requests as well as output. Four planted bugs were each caught.
- **Real n8n (2.41.4, latest Docker image):** node, AI tool variant, credential and icons load, both as a mounted folder and as an installed `npm pack` tarball.
- **Real API with a dummy token:** workflows for Brand → Get Many, Price → Get Many, Product → Get Stock and Order → Create (test order), plus the brand dropdown and the credential test, reach `api.fashion.cloud` and report `InvalidApiKeyError` correctly. Product → Get Many and Get Image were covered only by the automated tests.
- **Mock server via Base URL:** credential test and workflows use the mock; credentials without a Base URL still go to the real API.
- **Custom API Call (mock server):** n8n implements it through the HTTP Request node with *Predefined Credential Type* → *Fashion Cloud API*. GET and POST requests reached the mock with the token added and the body intact. The credential's Base URL isn't applied there, so a full URL is required (documented in the README). Running the Fashion Cloud node itself with "Custom API Call" selected now explains this instead of failing with `Could not get parameter "operation"`.
- **Clean-room CI run on Node 26:** `npm ci`, lint, tests and build pass.

## 6. Open points

### Before the first release
1. **Make the GitHub repo public.** The repo moved to [Best-Solution-IT/n8n-nodes-fashion-cloud](https://github.com/Best-Solution-IT/n8n-nodes-fashion-cloud) on 2026-09-30, and `package.json` and the codex file point there. It is still private: npm only publishes with provenance from public repositories, and the documentation links in the node lead to it.
2. **Set up npm publishing**: Trusted Publisher on npmjs.com (workflow `publish.yml`), or an `NPM_TOKEN` repository secret. A brand-new package may need its first release via token. The name `n8n-nodes-fashion-cloud` was still free on npm on 2026-09-30.
3. **Check with a real token** (e.g. in the dev container):
   - Price → Get Many with several GTINs. The spec doesn't define the format; the node sends them comma-separated.
   - A test order. Confirms the request body, including the fixed `type` and `clientType`.
   - Get Image with Watermark off (needs the `ecommerce` or `digitalWindow` permission).
   - Product → Get Many and Get Image, which haven't been run against the real API at all.
   - Successful responses in general: so far only error responses from the real API have been seen.

### Known limitations (not blocking)
- The pinned GitHub Actions don't update themselves. Once the repo is on GitHub, Dependabot (`package-ecosystem: github-actions`) can keep the SHAs current.
- `npm audit` reports 12 findings (11 moderate, 1 high), all in the CLI's development dependencies. The production audit (`--omit=dev`) is clean. The `overrides` workaround is forbidden by the CLI's lint.
- Automatic hot reload in Docker (`N8N_DEV_RELOAD`) is unverified on macOS; it didn't fire in the sandbox. `POST /rest/dev/reload` works as a fallback.
- n8n's lint plugin (0.34.0) falsely reports `no-credential-reuse` when the project sits directly under `/` (e.g. `/app`). Not relevant for normal paths or CI; could be reported upstream.
- AI agents: if an agent is given Order → Create with AI-filled fields, it could place orders. Test Order defaults to on; keep it on in that setup.
- Dev n8n instances that installed the package under its old name need `npm uninstall n8n-nodes-fashioncloud` and a reinstall; workflows built with it must have the node replaced.

## 7. History

| Commit | Change |
|---|---|
| `33db456` | State at the original review |
| `9a377a1` | Findings fixed, migration to `@n8n/node-cli` |
| `5f3f3ab` | Price, Stock and Order endpoints |
| `6a2af46` | Vitest test suite |
| `dc0b587` | Language dropdown |
| `b6ecc10` | Configurable Base URL |
| `5998969` | Package renamed to `n8n-nodes-fashion-cloud` |
