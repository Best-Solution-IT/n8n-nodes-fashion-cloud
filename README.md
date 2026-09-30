# n8n-nodes-fashioncloud

An n8n community node for the [Fashion Cloud API v2](https://api.fashion.cloud).

## Resources & Operations

| Resource | Operation | Description |
|----------|-----------|-------------|
| **Brand** | Get Many | List brands, optionally filtered by GLN. Supports *Return All* (offset pagination). |
| **Product** | Get Many | List products. A brand, GTIN or article number is required (GTIN and article number cannot be combined). Options: season, season year, language (26 supported, default German), updated since, preliminary images, products without images. Supports *Return All* (cursor pagination via `nextId`). |
| **Product** | Get Image | Download a product image (JPEG) as binary data by its image `_id` (from `media.images` of a product). Options: size (200/512/1024 px), minimum acceptable size, watermark. |
| **Product** | Get Stock | Stock and delivery time for one GTIN at the brand (values may be capped by the brand). The GTIN is added to the output. |
| **Price** | Get Many | Your retailer-specific prices for a brand. Options: GTINs (comma-separated), updated since. Supports *Return All* (cursor pagination via `nextId`). |
| **Order** | Create | Place an endless aisle order, either from fields (products, shipping/billing address, debitor, end customer, dropshipping) or as a raw JSON body. Products can come from a JSON array, e.g. a previous node. |

List operations output one n8n item per entry (the API's `data` array is unwrapped).

### Orders

- **Test Order** is on by default. Test orders are validated by Fashion Cloud but not placed. The toggle also overrides `isTest` in a JSON body.
- Orders are sent as `type: "endless-aisle"` with `clientType: "erp"`, as the API requires for external clients.
- Keep **Retry On Fail** off for order nodes: creating an order isn't idempotent, so a retry can place it twice.
- Validation errors (`ValidationError`) and stock problems (`OrderingProcessError`, with ordered/available quantity per GTIN) are shown in the error description.

## Credentials

This node uses **API Token** authentication. Obtain your token from the Fashion Cloud platform — your account has to be enabled for API access by Fashion Cloud — and add it as a **Fashion Cloud API** credential in n8n. The token is sent as the `token` query parameter, as required by the API. Use **Test** in the credential dialog to verify it.

## Installation

### Via n8n Community Nodes (recommended)
1. Go to **Settings → Community Nodes** in your n8n instance.
2. Search for `n8n-nodes-fashioncloud` and install.

### Manual
```bash
# In your n8n custom nodes directory
npm install n8n-nodes-fashioncloud
```

## Development

Requires **Node.js 24+** (tested with 24 and 26). The project uses n8n's official [`@n8n/node-cli`](https://www.npmjs.com/package/@n8n/node-cli) (`n8n-node`).

```bash
npm install
npm run dev        # starts n8n (via npx) on http://localhost:5678 with this node loaded, rebuilds on change
npm run build      # compile to dist/ and copy icons/codex files
npm run lint       # n8n community-node lint rules (strict mode, n8n Cloud eligible)
npm run lint:fix
```

### Tests

```bash
npm test               # type-check + run the Vitest suite
npm run test:watch     # re-run on change
npm run test:coverage  # with coverage report
```

The tests in `test/` run the node against an in-memory fake of the Fashion Cloud API (`test/helpers/fakeApi.ts`) that follows the OpenAPI spec in `docs/`: page size limits, offset/cursor pagination, required filters and the documented error bodies. Every API call the node makes is recorded, so tests check the exact requests as well as the output. CI runs them on every pull request and before publishing.

### Developing against n8n in Docker

`docker-compose.dev.yml` runs a separate, throwaway n8n (latest image) on http://localhost:5679 with this project mounted as a custom node:

```bash
docker compose -f docker-compose.dev.yml up -d
npm run dev:docker   # compiles to dist/ on change; n8n reloads the node (N8N_DEV_RELOAD)
docker compose -f docker-compose.dev.yml down -v   # remove it again, including its data
```

To try the node in another n8n container, mount the project the same way: `<project>:/home/node/.n8n/custom/node_modules/n8n-nodes-fashioncloud:ro`.

## Releasing

Community nodes must be published from GitHub Actions with npm provenance.

1. On npmjs.com, add this repository as a **Trusted Publisher** for the package (workflow `publish.yml`), or set an `NPM_TOKEN` repository secret.
2. Run `npm run release` locally. It bumps the version, updates `CHANGELOG.md`, commits, tags and pushes.
3. The tag push triggers `.github/workflows/publish.yml`, which lints, builds and publishes with provenance.

`npm publish` from a local machine is blocked on purpose (`prepublishOnly`).

## Notes

- For e-commerce use, request images with **Watermark** turned off. Images without watermark require the `ecommerce` or `digitalWindow` permission for the brand.
- API errors are surfaced with the Fashion Cloud error type, message and per-field details.

## License

MIT
