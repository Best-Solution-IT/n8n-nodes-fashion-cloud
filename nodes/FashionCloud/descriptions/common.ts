import type { INodeProperties } from 'n8n-workflow';

/** "Return All" + "Limit" fields for a list operation */
export function returnAllFields(resource: string, operation = 'getAll'): INodeProperties[] {
	return [
		{
			displayName: 'Return All',
			name: 'returnAll',
			type: 'boolean',
			default: false,
			description: 'Whether to return all results or only up to a given limit',
			displayOptions: { show: { resource: [resource], operation: [operation] } },
		},
		{
			displayName: 'Limit',
			name: 'limit',
			type: 'number',
			typeOptions: { minValue: 1 },
			default: 50,
			description: 'Max number of results to return',
			displayOptions: {
				show: { resource: [resource], operation: [operation], returnAll: [false] },
			},
		},
	];
}

/**
 * Brand picker: a searchable list of the brands available to the account, or an ID. A
 * resource locator rather than an `options` dropdown, which n8n flags as
 * 'The value "" is not supported!' while nothing is selected.
 */
export function brandField(
	description: string,
	properties: Partial<INodeProperties> = {},
): INodeProperties {
	return {
		displayName: 'Brand',
		name: 'brand',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		description,
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				placeholder: 'Select a brand...',
				typeOptions: { searchListMethod: 'searchBrands', searchable: true },
			},
			{
				displayName: 'By ID',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. 5879212',
			},
		],
		...properties,
	};
}
