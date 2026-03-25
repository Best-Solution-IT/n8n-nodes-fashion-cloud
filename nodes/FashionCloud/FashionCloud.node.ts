import {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
} from 'n8n-workflow';

export class FashionCloud implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Fashion Cloud',
		name: 'fashionCloud',
		icon: 'file:fashionCloud.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["resource"] + ": " + $parameter["operation"]}}',
		description: 'Interact with the Fashion Cloud API',
		defaults: {
			name: 'Fashion Cloud',
		},
		inputs: ['main'],
		outputs: ['main'],
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
					{ name: 'Brand', value: 'brands' },
					{ name: 'Product', value: 'products' },
					{ name: 'Image', value: 'images' },
				],
				default: 'brands',
			},

			// ── Operation selector ─────────────────────────────────────────────
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['brands'] } },
				options: [
					{
						name: 'Get Many',
						value: 'getMany',
						description: 'Retrieve a list of brands',
						action: 'Get many brands',
					},
				],
				default: 'getMany',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['products'] } },
				options: [
					{
						name: 'Get Many',
						value: 'getMany',
						description: 'Retrieve a list of products',
						action: 'Get many products',
					},
				],
				default: 'getMany',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: { show: { resource: ['images'] } },
				options: [
					{
						name: 'Get',
						value: 'get',
						description: 'Retrieve media images for a product',
						action: 'Get images for a product',
					},
				],
				default: 'get',
			},

			// ── Images: required path param ────────────────────────────────────
			{
				displayName: 'Product ID',
				name: 'id',
				type: 'string',
				required: true,
				default: '',
				description: 'The product ID to retrieve images for',
				displayOptions: { show: { resource: ['images'], operation: ['get'] } },
			},

			// ── Brands: optional query params ──────────────────────────────────
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: { show: { resource: ['brands'], operation: ['getMany'] } },
				options: [
					{
						displayName: 'Offset',
						name: 'offset',
						type: 'number',
						default: 0,
						description: 'Number of records to skip',
					},
					{
						displayName: 'Limit',
						name: 'limit',
						type: 'number',
						default: 50,
						description: 'Maximum number of records to return',
					},
					{
						displayName: 'GLN',
						name: 'gln',
						type: 'string',
						default: '',
						description: 'Filter by Global Location Number',
					},
				],
			},

			// ── Products: optional query params ───────────────────────────────
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: { show: { resource: ['products'], operation: ['getMany'] } },
				options: [
					{
						displayName: 'Offset',
						name: 'offset',
						type: 'number',
						default: 0,
						description: 'Number of records to skip',
					},
					{
						displayName: 'After ID',
						name: 'afterId',
						type: 'string',
						default: '',
						description: 'Return records after this ID (cursor-based pagination)',
					},
					{
						displayName: 'Limit',
						name: 'limit',
						type: 'number',
						default: 50,
						description: 'Maximum number of records to return',
					},
					{
						displayName: 'Updated Since',
						name: 'updatedSince',
						type: 'dateTime',
						default: '',
						description: 'Only return records updated after this date',
					},
					{
						displayName: 'Language',
						name: 'lang',
						type: 'string',
						default: '',
						description: 'Language code for localised fields (e.g. en, de)',
					},
					{
						displayName: 'Brand',
						name: 'brand',
						type: 'string',
						default: '',
						description: 'Filter by brand identifier',
					},
					{
						displayName: 'GTIN',
						name: 'gtin',
						type: 'string',
						default: '',
						description: 'Filter by GTIN / EAN barcode',
					},
					{
						displayName: 'Article Number',
						name: 'articleNumber',
						type: 'string',
						default: '',
						description: 'Filter by article number',
					},
					{
						displayName: 'Include Preliminary',
						name: 'includePreliminary',
						type: 'boolean',
						default: false,
						description: 'Whether to include preliminary products',
					},
					{
						displayName: 'Season',
						name: 'season',
						type: 'string',
						default: '',
						description: 'Filter by season (e.g. SS, AW)',
					},
					{
						displayName: 'Season Year',
						name: 'seasonYear',
						type: 'number',
						default: '',
						description: 'Filter by season year (e.g. 2024)',
					},
					{
						displayName: 'Include Products Without Images',
						name: 'includeProductsWithoutImages',
						type: 'boolean',
						default: false,
						description: 'Whether to include products that have no images',
					},
				],
			},

			// ── Images: optional query params ──────────────────────────────────
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: { show: { resource: ['images'], operation: ['get'] } },
				options: [
					{
						displayName: 'Max Width (px)',
						name: 'px',
						type: 'number',
						default: '',
						description: 'Resize images to this pixel width',
					},
					{
						displayName: 'Watermark',
						name: 'watermark',
						type: 'string',
						default: '',
						description: 'Watermark text to apply to images',
					},
					{
						displayName: 'Min Acceptable Size',
						name: 'minAcceptableSize',
						type: 'number',
						default: '',
						description: 'Minimum acceptable image size in bytes',
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				const additionalFields = this.getNodeParameter('additionalFields', i, {}) as Record<string, unknown>;

				let endpoint = '';
				const qs: IDataObject = {};

				// ── Build endpoint & query string ──────────────────────────────
				if (resource === 'brands' && operation === 'getMany') {
					endpoint = '/brands';
					if (additionalFields.offset !== undefined && additionalFields.offset !== '') qs.offset = additionalFields.offset;
					if (additionalFields.limit !== undefined && additionalFields.limit !== '') qs.limit = additionalFields.limit;
					if (additionalFields.gln) qs.gln = additionalFields.gln;

				} else if (resource === 'products' && operation === 'getMany') {
					endpoint = '/products';
					const fields: Array<keyof typeof additionalFields> = [
						'offset', 'afterId', 'limit', 'updatedSince', 'lang',
						'brand', 'gtin', 'articleNumber', 'includePreliminary',
						'season', 'seasonYear', 'includeProductsWithoutImages',
					];
					for (const field of fields) {
						const val = additionalFields[field];
						if (val !== undefined && val !== '' && val !== null) {
							qs[field] = val;
						}
					}

				} else if (resource === 'images' && operation === 'get') {
					const id = this.getNodeParameter('id', i) as string;
					endpoint = `/products/media/images/${encodeURIComponent(id)}`;
					if (additionalFields.px !== undefined) qs.px = additionalFields.px;
					if (additionalFields.watermark) qs.watermark = additionalFields.watermark;
					if (additionalFields.minAcceptableSize !== undefined) qs.minAcceptableSize = additionalFields.minAcceptableSize;

				} else {
					throw new NodeOperationError(this.getNode(), `Unknown resource/operation: ${resource}/${operation}`, { itemIndex: i });
				}

				// ── Execute request ────────────────────────────────────────────
				const response = await this.helpers.httpRequestWithAuthentication.call(this, 'fashionCloudApi', {
					method: 'GET',
					url: `https://api.fashion.cloud/v2${endpoint}`,
					qs,
					json: true,
				});

				// Normalise: wrap non-array responses in an array
				const results: unknown[] = Array.isArray(response) ? response : [response];

				returnData.push(
					...results.map((item) =>
						this.helpers.constructExecutionMetaData(
							this.helpers.returnJsonArray(item as IDataObject),
							{ itemData: { item: i } },
						),
					).flat(),
				);

			} catch (error) {
				if (this.continueOnFail()) {
					const message = error instanceof NodeOperationError
						? (error as NodeOperationError).message
						: 'An unexpected error occurred';
					returnData.push({ json: { error: message }, pairedItem: { item: i } });
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
