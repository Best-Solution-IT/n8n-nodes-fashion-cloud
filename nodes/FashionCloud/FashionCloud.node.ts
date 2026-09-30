import {
	IBinaryKeyData,
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	IN8nHttpFullResponse,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	JsonObject,
	NodeApiError,
	NodeConnectionTypes,
	NodeOperationError,
} from 'n8n-workflow';

import {
	fashionCloudApiRequest,
	fashionCloudApiRequestAllItems,
	toIsoDate,
} from './GenericFunctions';

// Maximum page sizes allowed by the API
const BRANDS_PAGE_SIZE = 200;
const PRODUCTS_PAGE_SIZE = 1000;

const IMAGE_SIZE_OPTIONS: INodePropertyOptions[] = [
	{ name: '200 Px', value: '200' },
	{ name: '512 Px', value: '512' },
	{ name: '1024 Px', value: '1024' },
];

export class FashionCloud implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Fashion Cloud',
		name: 'fashionCloud',
		icon: {
			light: 'file:../../icons/fashionCloud.svg',
			dark: 'file:../../icons/fashionCloud.dark.svg',
		},
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Interact with the Fashion Cloud API',
		defaults: {
			name: 'Fashion Cloud',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'fashionCloudApi',
				required: true,
			},
		],
		properties: [
			// ── Resource selector ──────────────────────────────────────────────
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Brand', value: 'brand' },
					{ name: 'Product', value: 'product' },
				],
				default: 'brand',
			},

			// ── Operation selectors ────────────────────────────────────────────
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['brand'] } },
				options: [
					{
						name: 'Get Many',
						value: 'getAll',
						description: 'Retrieve many brands',
						action: 'Get many brands',
					},
				],
				default: 'getAll',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['product'] } },
				options: [
					{
						name: 'Get Image',
						value: 'getImage',
						description: 'Download a product image as binary data',
						action: 'Get a product image',
					},
					{
						name: 'Get Many',
						value: 'getAll',
						description: 'Retrieve many products',
						action: 'Get many products',
					},
				],
				default: 'getAll',
			},

			// ── Brand: Get Many ────────────────────────────────────────────────
			{
				displayName: 'Return All',
				name: 'returnAll',
				type: 'boolean',
				default: false,
				description: 'Whether to return all results or only up to a given limit',
				displayOptions: { show: { resource: ['brand', 'product'], operation: ['getAll'] } },
			},
			{
				displayName: 'Limit',
				name: 'limit',
				type: 'number',
				typeOptions: { minValue: 1 },
				default: 50,
				description: 'Max number of results to return',
				displayOptions: {
					show: { resource: ['brand', 'product'], operation: ['getAll'], returnAll: [false] },
				},
			},
			{
				displayName: 'Filters',
				name: 'filters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				displayOptions: { show: { resource: ['brand'], operation: ['getAll'] } },
				options: [
					{
						displayName: 'GLN',
						name: 'gln',
						type: 'string',
						default: '',
						description: 'Only return the brand with this Global Location Number',
					},
				],
			},

			// ── Product: Get Many ──────────────────────────────────────────────
			{
				displayName: 'Brand Name or ID',
				name: 'brand',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getBrands' },
				default: '',
				description:
					'Brand to return products for. At least one of brand, GTIN or article number is required. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				displayOptions: { show: { resource: ['product'], operation: ['getAll'] } },
			},
			{
				displayName: 'Product Filter',
				name: 'productFilter',
				type: 'options',
				options: [
					{
						name: 'None',
						value: 'none',
						description: 'Filter by brand only',
					},
					{
						name: 'GTIN',
						value: 'gtin',
						description: 'Filter by GTIN / EAN barcode',
					},
					{
						name: 'Article Number',
						value: 'articleNumber',
						description: 'Filter by article number',
					},
				],
				default: 'none',
				description:
					'Additional product filter. GTIN and article number cannot be combined; both can be combined with a brand.',
				displayOptions: { show: { resource: ['product'], operation: ['getAll'] } },
			},
			{
				displayName: 'GTIN',
				name: 'gtin',
				type: 'string',
				required: true,
				default: '',
				description: 'GTIN / EAN barcode of the product',
				displayOptions: {
					show: { resource: ['product'], operation: ['getAll'], productFilter: ['gtin'] },
				},
			},
			{
				displayName: 'Article Number',
				name: 'articleNumber',
				type: 'string',
				required: true,
				default: '',
				description: 'Article number of the product',
				displayOptions: {
					show: { resource: ['product'], operation: ['getAll'], productFilter: ['articleNumber'] },
				},
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: { show: { resource: ['product'], operation: ['getAll'] } },
				options: [
					{
						displayName: 'Include Preliminary Images',
						name: 'includePreliminary',
						type: 'boolean',
						default: false,
						description: 'Whether to include preliminary images in the media.images array',
					},
					{
						displayName: 'Include Products Without Images',
						name: 'includeProductsWithoutImages',
						type: 'boolean',
						default: false,
						description: 'Whether to include products that have no images',
					},
					{
						displayName: 'Language',
						name: 'lang',
						type: 'string',
						default: 'de',
						placeholder: 'de',
						description:
							'Language of the localised fields. Defaults to "de" on the API side. See the <a href="https://www.notion.so/fashioncloud/Product-endpoint-3fad597ecaef498ba2e37dcc2cebf37f">Fashion Cloud docs</a> for possible values.',
					},
					{
						displayName: 'Season',
						name: 'season',
						type: 'options',
						options: [
							{ name: 'Fall/Winter', value: 'fall_winter' },
							{ name: 'No Season Assigned', value: 'none' },
							{ name: 'NOS (Never Out of Stock)', value: 'nos' },
							{ name: 'Spring/Summer', value: 'spring_summer' },
						],
						default: 'fall_winter',
						description: 'Only return products of this season',
					},
					{
						displayName: 'Season Year',
						name: 'seasonYear',
						type: 'string',
						default: '',
						placeholder: '2025',
						description: 'Only return products of this season year. Ignored when season is NOS.',
					},
					{
						displayName: 'Start After ID',
						name: 'afterId',
						type: 'string',
						default: '',
						description:
							'Pagination cursor: only return products after this ID (the "nextId" of a previous response)',
					},
					{
						displayName: 'Updated Since',
						name: 'updatedSince',
						type: 'dateTime',
						default: '',
						description:
							'Only return products created or updated since this date. Values without a timezone use the workflow timezone.',
					},
				],
			},

			// ── Product: Get Image ─────────────────────────────────────────────
			{
				displayName: 'Image ID',
				name: 'imageId',
				type: 'string',
				required: true,
				default: '',
				description:
					'The "_ID" of an image in the "media.images" array of a product (not the product ID)',
				displayOptions: { show: { resource: ['product'], operation: ['getImage'] } },
			},
			{
				displayName: 'Put Output File in Field',
				name: 'binaryPropertyName',
				type: 'string',
				required: true,
				default: 'data',
				hint: 'The name of the output binary field to put the image in',
				displayOptions: { show: { resource: ['product'], operation: ['getImage'] } },
			},
			{
				displayName: 'Options',
				name: 'imageOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: { show: { resource: ['product'], operation: ['getImage'] } },
				options: [
					{
						displayName: 'Minimum Acceptable Size',
						name: 'minAcceptableSize',
						type: 'options',
						options: IMAGE_SIZE_OPTIONS,
						default: '200',
						description:
							'If the image is not available in the requested size, fall back to smaller sizes down to this one. Only used together with "Size".',
					},
					{
						displayName: 'Size',
						name: 'px',
						type: 'options',
						options: IMAGE_SIZE_OPTIONS,
						default: '1024',
						description: 'Pixel size of the image. If not set, the original image is returned.',
					},
					{
						displayName: 'Watermark',
						name: 'watermark',
						type: 'boolean',
						default: false,
						description:
							'Whether to return the image with the Fashion Cloud watermark. Turn off for e-commerce use; images without watermark require the "ecommerce" or "digitalWindow" permission. If not set, the image without watermark is returned when permitted.',
					},
				],
			},
		],
	};

	methods = {
		loadOptions: {
			async getBrands(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const brands = await fashionCloudApiRequestAllItems.call(
					this,
					'/v2/brands',
					{},
					'offset',
					BRANDS_PAGE_SIZE,
				);
				return brands
					.map((brand) => ({ name: String(brand.name ?? brand._id), value: String(brand._id) }))
					.sort((a, b) => a.name.localeCompare(b.name));
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;

				if (resource === 'brand' && operation === 'getAll') {
					const returnAll = this.getNodeParameter('returnAll', i) as boolean;
					const limit = returnAll ? Infinity : (this.getNodeParameter('limit', i) as number);
					const filters = this.getNodeParameter('filters', i, {}) as IDataObject;

					const qs: IDataObject = {};
					if (filters.gln) qs.gln = filters.gln;

					const brands = await fashionCloudApiRequestAllItems.call(
						this,
						'/v2/brands',
						qs,
						'offset',
						BRANDS_PAGE_SIZE,
						limit,
					);
					returnData.push(...toExecutionData.call(this, brands, i));
				} else if (resource === 'product' && operation === 'getAll') {
					const returnAll = this.getNodeParameter('returnAll', i) as boolean;
					const limit = returnAll ? Infinity : (this.getNodeParameter('limit', i) as number);
					const brand = this.getNodeParameter('brand', i, '') as string;
					const productFilter = this.getNodeParameter('productFilter', i) as string;
					const options = this.getNodeParameter('options', i, {}) as IDataObject;

					const qs: IDataObject = {};
					if (brand) qs.brand = brand;
					if (productFilter === 'gtin') {
						qs.gtin = this.getNodeParameter('gtin', i) as string;
					} else if (productFilter === 'articleNumber') {
						qs.articleNumber = this.getNodeParameter('articleNumber', i) as string;
					}

					if (!qs.brand && !qs.gtin && !qs.articleNumber) {
						throw new NodeOperationError(
							this.getNode(),
							'A brand, GTIN or article number is required to list products',
							{ itemIndex: i },
						);
					}

					for (const key of [
						'afterId',
						'lang',
						'season',
						'seasonYear',
						'includePreliminary',
						'includeProductsWithoutImages',
					]) {
						const value = options[key];
						if (value !== undefined && value !== '' && value !== null) qs[key] = value;
					}
					if (options.updatedSince) {
						const updatedSince = toIsoDate(options.updatedSince, this.getTimezone());
						if (!updatedSince) {
							throw new NodeOperationError(
								this.getNode(),
								`Invalid "Updated Since" date: ${options.updatedSince}`,
								{ itemIndex: i },
							);
						}
						qs.updatedSince = updatedSince;
					}

					const products = await fashionCloudApiRequestAllItems.call(
						this,
						'/v2/products',
						qs,
						'cursor',
						PRODUCTS_PAGE_SIZE,
						limit,
					);
					returnData.push(...toExecutionData.call(this, products, i));
				} else if (resource === 'product' && operation === 'getImage') {
					const imageId = (this.getNodeParameter('imageId', i) as string).trim();
					const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;
					const imageOptions = this.getNodeParameter('imageOptions', i, {}) as IDataObject;

					if (!imageId) {
						throw new NodeOperationError(this.getNode(), 'Image ID must not be empty', {
							itemIndex: i,
						});
					}

					const qs: IDataObject = {};
					if (imageOptions.px) qs.px = imageOptions.px;
					if (imageOptions.minAcceptableSize) {
						if (!imageOptions.px) {
							throw new NodeOperationError(
								this.getNode(),
								'"Minimum Acceptable Size" only works together with "Size"',
								{ itemIndex: i },
							);
						}
						qs.minAcceptableSize = imageOptions.minAcceptableSize;
					}
					if (imageOptions.watermark !== undefined) qs.watermark = imageOptions.watermark;

					const response = (await fashionCloudApiRequest.call(
						this,
						'GET',
						`/v2/products/media/images/${encodeURIComponent(imageId)}`,
						qs,
						undefined,
						{ json: false, encoding: 'arraybuffer', returnFullResponse: true },
					)) as IN8nHttpFullResponse;

					const contentType = String(response.headers?.['content-type'] ?? 'image/jpeg');
					const mimeType = contentType.split(';')[0].trim();
					const fileName = `${imageId}${qs.px ? `_${qs.px}` : ''}.jpg`;
					const binary: IBinaryKeyData = {
						[binaryPropertyName]: await this.helpers.prepareBinaryData(
							Buffer.from(response.body as ArrayBuffer),
							fileName,
							mimeType,
						),
					};

					returnData.push({
						json: { imageId, ...qs },
						binary,
						pairedItem: { item: i },
					});
				} else {
					throw new NodeOperationError(
						this.getNode(),
						`Unsupported resource/operation: ${resource}/${operation}`,
						{ itemIndex: i },
					);
				}
			} catch (error) {
				if (this.continueOnFail()) {
					const err = error as { message?: string; description?: string | null };
					returnData.push({
						json: {
							error: err.message ?? String(error),
							...(err.description ? { description: err.description } : {}),
						},
						pairedItem: { item: i },
					});
					continue;
				}
				// Both constructors return the given instance unchanged if it already has their type
				if (error instanceof NodeApiError) {
					throw new NodeApiError(this.getNode(), error as unknown as JsonObject, { itemIndex: i });
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}

function toExecutionData(
	this: IExecuteFunctions,
	entries: IDataObject[],
	itemIndex: number,
): INodeExecutionData[] {
	return this.helpers.constructExecutionMetaData(this.helpers.returnJsonArray(entries), {
		itemData: { item: itemIndex },
	});
}
