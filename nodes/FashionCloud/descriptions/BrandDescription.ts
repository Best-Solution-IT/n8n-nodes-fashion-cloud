import type { INodeProperties } from 'n8n-workflow';

import { returnAllFields } from './common';

export const brandOperations: INodeProperties[] = [
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
];

export const brandFields: INodeProperties[] = [
	...returnAllFields('brand'),
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
];
