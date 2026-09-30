# Fashion Cloud node vs. API v2 spec — review

Compared `nodes/FashionCloud/FashionCloud.node.ts` and `credentials/FashionCloudApi.credentials.ts`
against `docs/fashion-cloud-api-v2.json` (OpenAPI 3.0.3, 6 operations).

> **Status (2026-09-30):** Section 1 has been fixed. Brand and Product now use `getAll`, and the image
> download moved to *Product → Get Image*. Shared request, pagination and error handling live in
> `nodes/FashionCloud/GenericFunctions.ts`. Credential test, lint/prettier setup and package metadata are done.
> Section 2 is implemented too: Price → Get Many, Product → Get Stock, Order → Create. Still open: automated tests in the repo (1.8).
>
> **Tooling:** migrated to `@n8n/node-cli` (strict mode, default lint config, GitHub Actions publish with
> npm provenance). This requires Node 24+.

## Coverage at a glance

| Endpoint | Spec operation | Node status |
|---|---|---|
| `GET /v2/brands` | List Brands | Implemented, but has flaws |
| `GET /v2/products` | List Products | Implemented, but has flaws |
| `GET /v2/products/media/images/{id}` | Load Product Image | Implemented, **broken** |
| `GET /v2/products/prices/` | GET Product prices | **Missing** |
| `GET /v2/products/{gtin}/stock` | GET Product's Stock | **Missing** |
| `POST /v2/orders` | POST Order (endless aisle) | **Missing** |

Auth matches the spec: the token goes in the `token` query parameter, which the credential's `authenticate.qs` handles correctly.

---

## 1. Needs fixing (existing implementation)

### 1.1 Image → Get is broken (critical)
The spec says the endpoint **always returns binary `image/jpeg`**. The node:
- sends `json: true` and pushes the response into `json` (`FashionCloud.node.ts:316-333`). The result is garbled data or a parse error instead of an image.
- **Fix:** request with `encoding: 'arraybuffer'` and `returnFullResponse: true`, then write the result with `this.helpers.prepareBinaryData(...)` to a configurable binary property (default `data`), with a `.jpg` file name and the `image/jpeg` MIME type.

Wrong parameter semantics:
| Param | Node | Spec |
|---|---|---|
| `id` (path) | "Product ID" (`:97-103`) | **Image `_id`**, i.e. `media.images[]._id` from a product, not the product ID |
| `px` | free number, "Max Width" | enum `200`, `512`, `1024`. If omitted, you get the original size |
| `watermark` | **string**, "Watermark text to apply" (`:252-256`) | **boolean**, with or without the FC watermark. E-commerce use *must* send `watermark=false` |
| `minAcceptableSize` | number, "size in **bytes**" (`:259-263`) | enum `200`, `512`, `1024` (**pixels**). Fallback size, only works together with `px` |

Also, the `px` and `minAcceptableSize` fields use `type: 'number'` with `default: ''`, which is a type mismatch. Make them `options` fields.

### 1.2 List responses are not unwrapped, and there is no pagination (high)
Every list endpoint returns an envelope: `{ offset|afterId, nextId, limit, totalElements, data: [...] }`.
The node wraps the whole envelope as **one** item (`:324`), so users get one item with a `data` array instead of one item per brand or product.
- **Fix:** output `response.data` as separate items.
- **Add "Return All" + "Limit"** (standard n8n pattern):
  - Brands: offset-based pagination (page size up to 200).
  - Products: cursor-based. Send `afterId = nextId` until there is no `nextId` or `data` is empty (page size up to 1000). The spec discourages `offset` ("not recommended anymore"). Hide it or mark it as deprecated.
  - Prices (once added): cursor-based with `afterId`/`nextId`, page size up to 200.
- Optionally offer a "Simplify / include metadata" toggle for users who need `totalElements`.

### 1.3 Products → Get Many: filter rules and wrong descriptions (high)
- The spec **requires at least one of `brand`, `gtin`, `articleNumber`**, and **`gtin` and `articleNumber` can't be combined**. The node makes all three optional in "Additional Fields", so the default configuration always fails with a 400.
  **Fix:** add a top-level required "Filter By" selector (Brand / GTIN / Article Number) with its value field. Keep `brand` combinable with the other two. Validate before sending.
- `brand` expects the brand `_id` from `/brands`. It could be a `resourceLocator`/`loadOptions` dropdown backed by `GET /v2/brands`.
- `season` description says "e.g. SS, AW" (`:216`). The actual values are `fall_winter`, `spring_summer`, `nos`, `none`. Make it an `options` field.
- `seasonYear` is `type: 'number'` with `default: ''` (`:219-223`). The spec type is string, and it is ignored when `season = nos`.
- `includePreliminary` description says "include preliminary *products*" (`:209`). The spec says it controls preliminary **images** in `media.images`.
- `includeProductsWithoutImages`: the spec default is `false`, which is fine. But the README note about the upstream typo `ncludeProductsWithoutImages` is **wrong**. The spec uses the correct name, and the note apparently came from a substring match. Remove that note.
- `lang`: make it an `options` field. The spec default is `de`, and the link lists the possible values.
- `limit`: the node default is 50. The spec default is 200 and the maximum is **1000**. Add `typeOptions: { minValue: 1, maxValue: 1000 }`.
- `updatedSince`: n8n `dateTime` values can come without a timezone. Normalise them to full ISO 8601 (for example `new Date(v).toISOString()`).

### 1.4 Brands → Get Many (medium)
- `limit`: the spec default is 200 and the maximum is **200**. Add `minValue`/`maxValue`.
- Needs Return All / pagination and `data` unwrapping (see 1.2).

### 1.5 Error handling (medium)
- In `continueOnFail`, any error that isn't a `NodeOperationError` is replaced with `'An unexpected error occurred'` (`:337-339`). That hides the useful API messages (`InvalidApiKeyError`, `ValidationError` with field list, `OrderingProcessError` with `availableQuantity`...).
  **Fix:** wrap HTTP errors in `NodeApiError(this.getNode(), error as JsonObject)` and surface `type`, `message` and `errors[]`. With `continueOnFail`, output `error.message` plus the details.
- 404 on images (`NotFoundError`) and 400/401 on stock should produce readable messages.

### 1.6 Credential (medium)
- Missing a credential `test` (`ICredentialTestRequest`), so users can't verify the token in the UI. Suggested test: `GET https://api.fashion.cloud/v2/brands?limit=1` (the token is added by `authenticate`).
- `documentationUrl` should point to real docs (the Notion page linked in the spec, or the repo README).
- Optional: move the base URL (`https://api.fashion.cloud`) into the credential, or at least into a constant. It is currently hard-coded in `execute`.

### 1.7 Node description / n8n conventions (low)
- Resource values are plural (`brands`, `products`, `images`). The n8n convention is singular camelCase (`brand`, `product`, `image`). Now (v0.1.0) is the cheap time to change it.
- `subtitle` shows raw values such as "brands: getMany". The usual pattern is `={{$parameter["operation"] + ": " + $parameter["resource"]}}`.
- Consider `usableAsTool: true` so the node works with the AI Agent.
- Consider moving the image endpoint under **Product** as "Get Image", or renaming the resource to "Product Image". It is a sub-resource of products.
- `returnData` building: calling `constructExecutionMetaData(returnJsonArray(...))` once per result object works, but it is simpler to call it once on the whole array.

### 1.8 Package / tooling (low–medium, blocks publishing)
- `npm run lint` fails. ESLint 10 is resolved transitively, no `eslint.config.*` / `.eslintrc.js` exists, and `eslint` is not a devDependency. `prepublishOnly` references `.eslintrc.prepublish.js`, which doesn't exist, so **`npm publish` will fail**. Consider migrating to `@n8n/node-cli` (`n8n-node build/lint`), which is the current community-node tooling.
- `package.json` still has placeholder `author`, `homepage` and `repository` (`your-org`, `you@example.com`).
- `"main": "index.js"`, but `index.ts` is outside the tsconfig `include`, so `dist/index.js` is never built. Either remove `main`/`index.ts` or include it.
- `.DS_Store` ended up in `dist/`. It is harmless, but the copy script and build could be cleaned up. `.gitignore` lists `dist/` twice.
- No tests.

---

## 2. Missing functionality

### 2.1 Product Price → Get Many — `GET /v2/products/prices/`
- **Required:** `brand` (brand `_id`).
- Optional: `gtins` (the spec doesn't define the format for several GTINs; probably comma-separated, so check), `updatedSince` (date-time), `limit` (default and max 200), `afterId`.
- Response: `{ totalElements, data: [{ gtin, currency, purchasePrice, discountedPurchasePrice, recommendedRetailPrice, discountedRecommendedRetailPrice, updated }], afterId, limit, nextId }`. Unwrap `data` and paginate using `nextId`.
- Note the trailing slash in the path.
- Prices are retailer-specific. Mention this in the node description.

### 2.2 Product Stock → Get — `GET /v2/products/{gtin}/stock`
- Path param `gtin` (required). The endpoint accepts only one GTIN per call, which maps naturally to one call per input item.
- Response: `{ stock, deliveryTime: { minimum, maximum }, created, updated }`. Values may be capped by the brand.
- Errors: 400 `InvalidParametersError`, 401 `InvalidApiKeyError`.

### 2.3 Order → Create — `POST /v2/orders` (endless aisle)
Request body (JSON):
- **Required:** `type` (`endless-aisle` | `b2b-order`; only `endless-aisle` is relevant externally), `products[]` (`{ gtin, quantity }`, max 1000), `shippingAddress` (`gln`, `name`, `address1`, `city`, `zip`, `country` required; `address2`, `email`, `phone` optional).
- `clientId`: required for endless aisle.
- `clientType`: must be `erp` for external callers.
- `debitor`: `gln` required for endless aisle (the buyer GLN, or the shipping GLN as a fallback). Also `phone`, `name`, `email`, `employeeId`, `employeeName`.
- Optional: `billingAddress` (same shape as shipping), `endCustomer` (`customerNumber`, `name`, `email`, `phone`), `useDropshipping` (experimental), `isTest` (boolean).

UI suggestion:
- `fixedCollection` for products (GTIN + quantity), plus a "Products (JSON)" alternative for bulk carts built by previous nodes.
- Collections for shipping, billing, debitor and end customer.
- `isTest` as a prominent boolean. Consider defaulting it to `true` so trying the node never places a real order.
- Offer a "Send raw JSON body" mode as an escape hatch.

Response:
- 200: `{ _id, orderNumber, status }`.
- 400 has two error shapes: `ValidationError` (`errors[]` with `field`/`type`/`message`) and `OrderingProcessError` (`errors[]` with `gtin`, `orderedQuantity`, `availableQuantity`). Surface both in full.

Safety: this is a non-idempotent write. Document that users should **not** turn on "Retry on Fail" for this operation, since a retry could place duplicate orders.

---

## 3. Suggested target structure

| Resource | Operations |
|---|---|
| Brand | Get Many (Return All, Limit, GLN filter) |
| Product | Get Many (required filter + options, Return All via `nextId`), Get Image (binary), Get Stock |
| Price | Get Many (brand required, gtins, updatedSince, Return All via `nextId`) |
| Order | Create (endless aisle; `isTest`) |

Shared helper: `fashionCloudApiRequest()` for requests and error mapping, and `fashionCloudApiRequestAllItems()` for offset and cursor pagination. These go in `GenericFunctions.ts`.
