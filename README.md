# n8n-nodes-fashioncloud

An n8n community node for the [Fashion Cloud API](https://api.fashion.cloud).

## Resources & Operations

| Resource | Operation | Description |
|----------|-----------|-------------|
| **Brand** | Get Many | List all brands, with optional `offset`, `limit`, and `gln` filters |
| **Product** | Get Many | List products with rich filtering: brand, GTIN, article number, season, language, date range, and more |
| **Image** | Get | Retrieve media images for a product by ID, with optional resize (`px`), watermark, and size filters |

## Credentials

This node uses **API Token** authentication. Obtain your token from the Fashion Cloud portal and add it as a **Fashion Cloud API** credential in n8n.

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

```bash
npm install
npm run build   # compile TypeScript → dist/
npm run dev     # watch mode
```

To test locally, symlink the package into your n8n custom nodes folder:
```bash
cd ~/.n8n/custom
npm link /path/to/n8n-nodes-fashioncloud
```

## Notes

- The `includeProductsWithoutImages` param preserves the upstream API's typo (`ncludeProductsWithoutImages`) for compatibility.
- All optional fields are omitted from the request when left blank — the API ignores absent optional params.

## License

MIT
