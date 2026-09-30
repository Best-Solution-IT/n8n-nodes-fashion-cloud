import type { INodeProperties, INodePropertyOptions } from 'n8n-workflow';

import { returnAllFields } from './common';

/** Languages supported by the product endpoint (Fashion Cloud docs) */
export const LANGUAGE_OPTIONS: INodePropertyOptions[] = [
	{ name: 'Bulgarian', value: 'bg' },
	{ name: 'Croatian', value: 'hr' },
	{ name: 'Czech', value: 'cs' },
	{ name: 'Danish', value: 'da' },
	{ name: 'Dutch', value: 'nl' },
	{ name: 'English', value: 'en' },
	{ name: 'Estonian', value: 'et' },
	{ name: 'Finnish', value: 'fi' },
	{ name: 'French', value: 'fr' },
	{ name: 'German', value: 'de' },
	{ name: 'Greek', value: 'el' },
	{ name: 'Hungarian', value: 'hu' },
	{ name: 'Irish', value: 'ga' },
	{ name: 'Italian', value: 'it' },
	{ name: 'Latvian', value: 'lv' },
	{ name: 'Lithuanian', value: 'lt' },
	{ name: 'Norwegian', value: 'no' },
	{ name: 'Polish', value: 'pl' },
	{ name: 'Portuguese', value: 'pt' },
	{ name: 'Romanian', value: 'ro' },
	{ name: 'Russian', value: 'ru' },
	{ name: 'Slovak', value: 'sk' },
	{ name: 'Slovenian', value: 'sl' },
	{ name: 'Spanish', value: 'es' },
	{ name: 'Swedish', value: 'sv' },
	{ name: 'Turkish', value: 'tr' },
];

const IMAGE_SIZE_OPTIONS: INodePropertyOptions[] = [
	{ name: '200 Px', value: '200' },
	{ name: '512 Px', value: '512' },
	{ name: '1024 Px', value: '1024' },
];

export const productOperations: INodeProperties[] = [
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
			{
				name: 'Get Stock',
				value: 'getStock',
				description: "Get a product's stock and delivery time at the brand",
				action: 'Get product stock',
			},
		],
		default: 'getAll',
	},
];

const getAllFields: INodeProperties[] = [
	...returnAllFields('product'),
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
				type: 'options',
				options: LANGUAGE_OPTIONS,
				default: 'de',
				description: 'Language of the localised product fields. The API uses German if not set.',
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
];

const getImageFields: INodeProperties[] = [
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
];

const getStockFields: INodeProperties[] = [
	{
		displayName: 'GTIN',
		name: 'stockGtin',
		type: 'string',
		required: true,
		default: '',
		description:
			'GTIN / EAN barcode of the product. The API returns one GTIN per request; stock values may be capped by the brand.',
		displayOptions: { show: { resource: ['product'], operation: ['getStock'] } },
	},
];

export const productFields: INodeProperties[] = [
	...getAllFields,
	...getImageFields,
	...getStockFields,
];
