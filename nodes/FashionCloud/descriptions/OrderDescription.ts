import type { INodeProperties } from 'n8n-workflow';

const show = (extra: Record<string, string[]> = {}) => ({
	show: { resource: ['order'], operation: ['create'], ...extra },
});

function addressFields(required: boolean): INodeProperties[] {
	return [
		{
			displayName: 'Name',
			name: 'name',
			type: 'string',
			required,
			default: '',
		},
		{
			displayName: 'Address Line 1',
			name: 'address1',
			type: 'string',
			required,
			default: '',
		},
		{
			displayName: 'Address Line 2',
			name: 'address2',
			type: 'string',
			default: '',
		},
		{
			displayName: 'ZIP Code',
			name: 'zip',
			type: 'string',
			required,
			default: '',
		},
		{
			displayName: 'City',
			name: 'city',
			type: 'string',
			required,
			default: '',
		},
		{
			displayName: 'Country',
			name: 'country',
			type: 'string',
			required,
			default: '',
			placeholder: 'DE',
			description: 'ISO 3166-1 alpha-2 country code',
		},
		{
			displayName: 'GLN',
			name: 'gln',
			type: 'string',
			required,
			default: '',
			description: 'Global Location Number of the address',
		},
		{
			displayName: 'Email',
			name: 'email',
			type: 'string',
			placeholder: 'name@email.com',
			default: '',
		},
		{
			displayName: 'Phone',
			name: 'phone',
			type: 'string',
			default: '',
		},
	];
}

export const orderOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['order'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Place an endless aisle order',
				action: 'Create an order',
			},
		],
		default: 'create',
	},
];

export const orderFields: INodeProperties[] = [
	{
		displayName:
			'Orders are not idempotent: keep "Retry On Fail" off for this node, otherwise a retry can place the same order twice. Keep "Test Order" on until your setup is verified.',
		name: 'orderNotice',
		type: 'notice',
		default: '',
		displayOptions: show(),
	},
	{
		displayName: 'Test Order',
		name: 'isTest',
		type: 'boolean',
		default: true,
		description:
			'Whether to send a test order. Test orders are validated like real orders but not placed. Also applies when the order is specified as JSON.',
		displayOptions: show(),
	},
	{
		displayName: 'Specify Order',
		name: 'specifyOrder',
		type: 'options',
		options: [
			{ name: 'Using Fields Below', value: 'fields' },
			{ name: 'Using JSON', value: 'json' },
		],
		default: 'fields',
		displayOptions: show(),
	},
	{
		displayName: 'Order (JSON)',
		name: 'orderJson',
		type: 'json',
		required: true,
		default:
			'{\n  "type": "endless-aisle",\n  "clientType": "erp",\n  "clientId": "",\n  "products": [{ "gtin": "", "quantity": 1 }],\n  "debitor": { "gln": "" },\n  "shippingAddress": {\n    "gln": "",\n    "name": "",\n    "address1": "",\n    "city": "",\n    "zip": "",\n    "country": "DE"\n  }\n}',
		description:
			'Request body as described in the Fashion Cloud API documentation for POST /v2/orders',
		displayOptions: show({ specifyOrder: ['json'] }),
	},

	// ── Using fields ──────────────────────────────────────────────────────
	{
		displayName: 'Client ID',
		name: 'clientId',
		type: 'string',
		required: true,
		default: '',
		description: 'Your client ID for endless aisle orders',
		displayOptions: show({ specifyOrder: ['fields'] }),
	},
	{
		displayName: 'Debitor GLN',
		name: 'debitorGln',
		type: 'string',
		required: true,
		default: '',
		description: "Your buyer GLN. If you don't have one, use your shipping GLN.",
		displayOptions: show({ specifyOrder: ['fields'] }),
	},
	{
		displayName: 'Products Input',
		name: 'productsInput',
		type: 'options',
		options: [
			{ name: 'Define Below', value: 'fields' },
			{
				name: 'From JSON',
				value: 'json',
				description: 'Pass an array of { gtin, quantity }, e.g. from a previous node',
			},
		],
		default: 'fields',
		displayOptions: show({ specifyOrder: ['fields'] }),
	},
	{
		displayName: 'Products',
		name: 'products',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		placeholder: 'Add Product',
		default: {},
		description: 'Products to order (max. 1000).',
		displayOptions: show({ specifyOrder: ['fields'], productsInput: ['fields'] }),
		options: [
			{
				displayName: 'Product',
				name: 'product',
				values: [
					{
						displayName: 'GTIN',
						name: 'gtin',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Quantity',
						name: 'quantity',
						type: 'number',
						typeOptions: { minValue: 1 },
						default: 1,
					},
				],
			},
		],
	},
	{
		displayName: 'Products (JSON)',
		name: 'productsJson',
		type: 'json',
		required: true,
		default: '[\n  { "gtin": "", "quantity": 1 }\n]',
		description: 'Array of products to order, each with "gtin" and "quantity" (max. 1000).',
		displayOptions: show({ specifyOrder: ['fields'], productsInput: ['json'] }),
	},
	{
		displayName: 'Shipping Address',
		name: 'shippingAddress',
		type: 'fixedCollection',
		placeholder: 'Add Shipping Address',
		default: {},
		required: true,
		displayOptions: show({ specifyOrder: ['fields'] }),
		options: [
			{
				displayName: 'Address',
				name: 'address',
				values: addressFields(true),
			},
		],
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: show({ specifyOrder: ['fields'] }),
		options: [
			{
				displayName: 'Billing Address',
				name: 'billingAddress',
				type: 'fixedCollection',
				placeholder: 'Add Billing Address',
				default: {},
				options: [
					{
						displayName: 'Address',
						name: 'address',
						values: addressFields(false),
					},
				],
			},
			{
				displayName: 'Debitor Details',
				name: 'debitor',
				type: 'fixedCollection',
				placeholder: 'Add Debitor Details',
				default: {},
				options: [
					{
						displayName: 'Details',
						name: 'details',
						values: [
							{
								displayName: 'Email',
								name: 'email',
								type: 'string',
								placeholder: 'name@email.com',
								default: '',
							},
							{
								displayName: 'Employee ID',
								name: 'employeeId',
								type: 'string',
								default: '',
							},
							{
								displayName: 'Employee Name',
								name: 'employeeName',
								type: 'string',
								default: '',
							},
							{
								displayName: 'Name',
								name: 'name',
								type: 'string',
								default: '',
							},
							{
								displayName: 'Phone',
								name: 'phone',
								type: 'string',
								default: '',
							},
						],
					},
				],
			},
			{
				displayName: 'End Customer',
				name: 'endCustomer',
				type: 'fixedCollection',
				placeholder: 'Add End Customer',
				default: {},
				options: [
					{
						displayName: 'Customer',
						name: 'customer',
						values: [
							{
								displayName: 'Customer Number',
								name: 'customerNumber',
								type: 'string',
								default: '',
							},
							{ displayName: 'Name', name: 'name', type: 'string', default: '' },
							{
								displayName: 'Email',
								name: 'email',
								type: 'string',
								placeholder: 'name@email.com',
								default: '',
							},
							{ displayName: 'Phone', name: 'phone', type: 'string', default: '' },
						],
					},
				],
			},
			{
				displayName: 'Use Dropshipping',
				name: 'useDropshipping',
				type: 'boolean',
				default: false,
				description:
					'Whether to ship directly to the end customer. Only fully supported by some brands and experimental for others; contact Fashion Cloud support before using it.',
			},
		],
	},
];
