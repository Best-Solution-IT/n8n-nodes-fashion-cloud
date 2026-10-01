import type { INodeProperties } from 'n8n-workflow';

import { brandField, returnAllFields } from './common';

export const priceOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['price'] } },
		options: [
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Retrieve your retailer-specific prices for a brand',
				action: 'Get many prices',
			},
		],
		default: 'getAll',
	},
];

export const priceFields: INodeProperties[] = [
	brandField('Brand to return prices for. Prices are specific to your retailer account.', {
		required: true,
		displayOptions: { show: { resource: ['price'], operation: ['getAll'] } },
	}),
	...returnAllFields('price'),
	{
		displayName: 'Options',
		name: 'priceOptions',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: { resource: ['price'], operation: ['getAll'] } },
		options: [
			{
				displayName: 'GTINs',
				name: 'gtins',
				type: 'string',
				default: '',
				placeholder: '8719936125740,8719936125757',
				description: 'Only return prices for these GTINs (comma-separated)',
			},
			{
				displayName: 'Start After ID',
				name: 'afterId',
				type: 'string',
				default: '',
				description:
					'Pagination cursor: only return prices after this ID (the "nextId" of a previous response)',
			},
			{
				displayName: 'Updated Since',
				name: 'updatedSince',
				type: 'dateTime',
				default: '',
				description:
					'Only return prices created or updated since this date. Values without a timezone use the workflow timezone.',
			},
		],
	},
];
