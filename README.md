# n8n-nodes-fashion-cloud

An n8n community node for the [Fashion Cloud API v2](https://docs.api.fashion.cloud/#fashion-cloud-api-v2).

## Resources & Operations

| Resource | Operation | Description |
|----------|-----------|-------------|
| **Brand** | Get Many | List brands, optionally filtered by GLN. Supports *Return All* (offset pagination). |
| **Product** | Get Many | List products by brand, GTIN or article number (**Filter By**). A search by article number can be limited to one brand. Options: season, season year, language (26 supported, default German), updated since, preliminary images, products without images. Supports *Return All* (cursor pagination via `nextId`). |
| **Product** | Get Image | Download a product image (JPEG) as binary data by its image `_id` (from `media.images` of a product). Options: size (200/512/1024 px), minimum acceptable size, watermark. |
| **Product** | Get Stock | Stock and delivery time for one GTIN at the brand (values may be capped by the brand). The GTIN is added to the output. |
| **Price** | Get Many | Your retailer-specific prices for a brand. Options: GTINs (comma-separated), updated since. Supports *Return All* (cursor pagination via `nextId`). |
| **Order** | Create | Place an endless aisle order, either from fields (products, shipping/billing address, debitor, end customer, dropshipping) or as a raw JSON body. Products can come from a JSON array, e.g. a previous node. |

List operations output one n8n item per entry (the API's `data` array is unwrapped).

Brands are picked from a searchable list of the brands your account can access, or entered by ID.

### Orders

- **Test Order** is on by default. Test orders are validated by Fashion Cloud but not placed. The toggle also overrides `isTest` in a JSON body.
- If **Test Order** is set by an expression, it must resolve to `true` or `false`. Anything else, such as an empty value, stops the node before an order is sent.
- Orders are sent as `type: "endless-aisle"` with `clientType: "erp"`, as the API requires for external clients.
- Keep **Retry On Fail** off for order nodes: creating an order isn't idempotent, so a retry can place it twice.
- Validation errors (`ValidationError`) and stock problems (`OrderingProcessError`, with ordered/available quantity per GTIN) are shown in the error description.

### Custom API calls

For requests the node doesn't offer, use n8n's **HTTP Request** node. Selecting "Custom API Call" in the Fashion Cloud node points you there too.

1. Set **Authentication** to *Predefined Credential Type* and choose **Fashion Cloud API**.
2. Enter the **full URL**, e.g. `https://api.fashion.cloud/v2/brands`. The credential's Base URL is not applied here, so relative paths don't work.
3. The token is added as the `token` query parameter automatically.

## Credentials

This node uses **API Token** authentication. Obtain your token from the Fashion Cloud platform — your account has to be enabled for API access by Fashion Cloud — and add it as a **Fashion Cloud API** credential in n8n. The token is sent as the `token` query parameter, as required by the API. Use **Test** in the credential dialog to verify it.

**Base URL** defaults to `https://api.fashion.cloud`. Change it only to test against a mock or staging server, for example with a second credential named "Fashion Cloud (Mock)":

- Enter the server root without `/v2`; the node appends paths like `/v2/brands`.
- If n8n runs in Docker and the mock on your machine, use `http://host.docker.internal:<port>`, since `localhost` is the container itself.
- The mock receives the token as the `token` query parameter, so give the mock credential a dummy token rather than your real one.
- `http://` is only accepted for local servers: `localhost`, `host.docker.internal`, private IP addresses and single-word host names such as Docker service names. Everything else needs `https://`, because the token is part of the URL. This also applies when the credential is used in the HTTP Request node.
- Credentials created before this field existed keep using the Fashion Cloud API.

If you share the credential with other users, consider setting its **Allowed HTTP Request Domains** to `api.fashion.cloud`. It can then no longer be used to send the token to other hosts through the HTTP Request node.

## Installation

### Via n8n Community Nodes (recommended)
1. Go to **Settings → Community Nodes** in your n8n instance.
2. Search for `n8n-nodes-fashion-cloud` and install.

### Manual
```bash
# In your n8n custom nodes directory
npm install n8n-nodes-fashion-cloud
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

The tests in `test/` run the node against an in-memory fake of the Fashion Cloud API (`test/helpers/fakeApi.ts`) that follows Fashion Cloud's OpenAPI spec for API v2: page size limits, offset/cursor pagination, required filters and the documented error bodies. Every API call the node makes is recorded, so tests check the exact requests as well as the output. CI runs them on every pull request and before publishing.

### Developing against n8n in Docker

`docker-compose.dev.yml` runs a separate, throwaway n8n (latest image) on http://localhost:5679 with this project mounted as a custom node:

```bash
docker compose -f docker-compose.dev.yml up -d
npm run dev:docker   # compiles to dist/ on change; n8n reloads the node (N8N_DEV_RELOAD)
docker compose -f docker-compose.dev.yml down -v   # remove it again, including its data
```

To use the mounted project in another n8n container instead, add this volume, set `N8N_DEV_RELOAD=true` on the container and run `npm run dev:docker`:

```
<project>:/home/node/.n8n/custom/node_modules/n8n-nodes-fashion-cloud:ro
```

A mounted project is registered as `CUSTOM.fashionCloud`, not under its package name. Workflows built with it won't use the published package later; the node has to be replaced in them. That's why `docker-compose.dev.yml` uses a throwaway n8n. For an instance whose workflows you want to keep, install a local build instead (next section).

To test against a mock API, create a second credential with the mock's address as **Base URL** (see [Credentials](#credentials)).

### Installing a local build in an existing n8n container

This installs the package the same way n8n does when it comes from npm, without publishing it:

```bash
npm run build
npm pack        # creates n8n-nodes-fashion-cloud-<version>.tgz
docker cp n8n-nodes-fashion-cloud-<version>.tgz <container>:/tmp/
docker exec -u node <container> sh -c 'mkdir -p /home/node/.n8n/nodes && cd /home/node/.n8n/nodes && npm install --omit=dev --legacy-peer-deps --ignore-scripts /tmp/n8n-nodes-fashion-cloud-<version>.tgz'
docker restart <container>
```

- The node gets its real type, `n8n-nodes-fashion-cloud.fashionCloud`, so workflows keep working after switching to the published package.
- Keep `--legacy-peer-deps`: without it npm installs a second copy of `n8n-workflow` and its dependencies next to the one n8n already provides.
- The install survives image updates as long as `/home/node/.n8n` is on a volume.
- The package doesn't appear under **Settings → Community Nodes**, because it wasn't installed through the UI. To update it, repeat the steps.
- To remove it, run `npm uninstall n8n-nodes-fashion-cloud` in `/home/node/.n8n/nodes` and restart the container. Do this before installing the published version.
- An instance that still has the package under its old name needs `npm uninstall n8n-nodes-fashioncloud` first. Workflows built with the old package must have the node replaced, because the node type changed with the name.

## Releasing

Community nodes must be published from GitHub Actions with npm provenance.

1. On npmjs.com, add this repository as a **Trusted Publisher** for the package (workflow `publish.yml`), or set an `NPM_TOKEN` repository secret.
2. Describe the changes for users under `## [Unreleased]` in `CHANGELOG.md`. The release stops if that section is empty.
3. Run `GITHUB_TOKEN=$(gh auth token) npm run release` locally on `main`. [release-it](https://github.com/release-it/release-it) (config in `.release-it.json`) lints, tests and builds, asks for the new version, renames the Unreleased section to that version, commits, tags, pushes and creates a GitHub release with the changelog entry as notes. Without `GITHUB_TOKEN` it prints a link to create the GitHub release in the browser instead.
4. The tag push triggers `.github/workflows/publish.yml`, which runs `n8n-node release`: lint, build and publish with provenance.

`npm publish` from a local machine is blocked on purpose (`prepublishOnly`).

## Notes

- For e-commerce use, request images with **Watermark** turned off. Images without watermark require the `ecommerce` or `digitalWindow` permission for the brand.
- API errors are surfaced with the Fashion Cloud error type, message and per-field details.

## License

MIT
