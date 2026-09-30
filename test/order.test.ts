import type { IDataObject } from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';

import { createFakeApi } from './helpers/fakeApi';
import { runNode, runNodeExpectingError } from './helpers/run';

const api = createFakeApi({ stock: { '4044816620478': 120 } });

const shippingAddress = {
	address: {
		gln: '4567891234',
		name: 'John Doe',
		address1: 'Hongkongstrasse 1',
		address2: '',
		zip: '20457',
		city: 'Hamburg',
		country: 'DE',
		email: 'john@example.com',
		phone: '',
	},
};

const fieldsOrder = {
	resource: 'order',
	operation: 'create',
	isTest: true,
	specifyOrder: 'fields',
	clientId: 'client-1',
	debitorGln: '1234567890123',
	productsInput: 'fields',
	products: { product: [{ gtin: '4044816620478', quantity: 2 }] },
	shippingAddress,
	additionalFields: {},
};

const withFields = (overrides: IDataObject) => ({ ...fieldsOrder, ...overrides });

describe('Order → Create (fields)', () => {
	it('builds the endless aisle order body from the fields', async () => {
		const { output, calls } = await runNode({
			params: withFields({
				products: {
					product: [
						{ gtin: '4044816620478', quantity: 2 },
						{ gtin: '999', quantity: 1 },
					],
				},
				additionalFields: {
					// optional fields that were added but left blank must not be sent
					billingAddress: { address: { name: '', city: '' } },
					debitor: { details: { name: 'Store Hamburg', employeeId: '' } },
					endCustomer: { customer: { customerNumber: 'C-1', email: 'c@example.com' } },
					useDropshipping: false,
				},
			}),
			api,
		});

		expect(calls).toHaveLength(1);
		expect(calls[0]).toMatchObject({ method: 'POST', url: '/v2/orders', qs: {} });
		expect(calls[0].body).toEqual({
			type: 'endless-aisle',
			clientType: 'erp',
			clientId: 'client-1',
			isTest: true,
			products: [
				{ gtin: '4044816620478', quantity: 2 },
				{ gtin: '999', quantity: 1 },
			],
			debitor: { name: 'Store Hamburg', gln: '1234567890123' },
			shippingAddress: {
				gln: '4567891234',
				name: 'John Doe',
				address1: 'Hongkongstrasse 1',
				zip: '20457',
				city: 'Hamburg',
				country: 'DE',
				email: 'john@example.com',
			},
			endCustomer: { customerNumber: 'C-1', email: 'c@example.com' },
			useDropshipping: false,
		});
		expect(output).toEqual([
			{
				json: { _id: '123456', orderNumber: 'FC2345812', status: 'open', isTest: true },
				pairedItem: { item: 0 },
			},
		]);
	});

	it('leaves out optional sections that were not added', async () => {
		const { calls } = await runNode({ params: fieldsOrder, api });

		expect(Object.keys(calls[0].body as IDataObject).sort()).toEqual([
			'clientId',
			'clientType',
			'debitor',
			'isTest',
			'products',
			'shippingAddress',
			'type',
		]);
	});

	it('sends real orders only when Test Order is off', async () => {
		const { calls } = await runNode({ params: withFields({ isTest: false }), api });

		expect((calls[0].body as IDataObject).isTest).toBe(false);
	});

	it.each([
		['true', true],
		[' False ', false],
	])('accepts Test Order given as the text %j', async (isTest, expected) => {
		const { output, calls } = await runNode({ params: withFields({ isTest }), api });

		expect((calls[0].body as IDataObject).isTest).toBe(expected);
		expect(output[0].json.isTest).toBe(expected);
	});

	// e.g. an expression like {{ $json.isTest }} where the field is missing
	it.each([[undefined], [null], [''], ['yes'], [0], [1]])(
		'rejects Test Order = %j instead of placing a real order',
		async (isTest) => {
			const { error, calls } = await runNodeExpectingError({
				params: withFields({ isTest }),
				api,
			});

			expect(error).toBeInstanceOf(NodeOperationError);
			expect(error.message).toBe('"Test Order" must be true or false');
			expect(error.description).toContain('no order was sent');
			expect(calls).toHaveLength(0);
		},
	);

	it('accepts products as a JSON array and normalises GTIN and quantity', async () => {
		const { calls } = await runNode({
			params: withFields({
				productsInput: 'json',
				productsJson: '[{ "gtin": 4044816620478, "quantity": "3" }]',
			}),
			api,
		});

		expect((calls[0].body as IDataObject).products).toEqual([
			{ gtin: '4044816620478', quantity: 3 },
		]);
	});

	it('accepts an already parsed products array (from an expression)', async () => {
		const { calls } = await runNode({
			params: withFields({
				productsInput: 'json',
				productsJson: [{ gtin: '4044816620478', quantity: 1 }],
			}),
			api,
		});

		expect((calls[0].body as IDataObject).products).toEqual([
			{ gtin: '4044816620478', quantity: 1 },
		]);
	});

	describe('validation before sending', () => {
		it.each([
			[
				'missing shipping fields',
				{ shippingAddress: { address: { name: 'John Doe', gln: '' } } },
				'Shipping address is missing: gln, address1, zip, city, country',
			],
			['no shipping address at all', { shippingAddress: {} }, 'Shipping address is missing'],
			['no products', { products: {} }, 'At least one product is required'],
			[
				'a quantity of 0',
				{ products: { product: [{ gtin: '1', quantity: 0 }] } },
				'Product 1 (1) needs a whole-number quantity of at least 1',
			],
			[
				'a fractional quantity',
				{ products: { product: [{ gtin: '1', quantity: 1.5 }] } },
				'needs a whole-number quantity',
			],
			[
				'an empty GTIN',
				{ products: { product: [{ gtin: ' ', quantity: 1 }] } },
				'Product 1 has no GTIN',
			],
			[
				'more than 1000 products',
				{
					productsInput: 'json',
					productsJson: Array.from({ length: 1001 }, () => ({ gtin: '1', quantity: 1 })),
				},
				'An order can contain at most 1000 products (got 1001)',
			],
			[
				'invalid products JSON',
				{ productsInput: 'json', productsJson: '[{ gtin:' },
				'"Products (JSON)" is not valid JSON',
			],
			['a blank client ID', { clientId: '  ' }, 'Client ID must not be empty'],
			['a blank debitor GLN', { debitorGln: '' }, 'Debitor GLN must not be empty'],
		])('rejects %s', async (_case, overrides, message) => {
			const { error, calls } = await runNodeExpectingError({
				params: withFields(overrides as IDataObject),
				api,
			});

			expect(error).toBeInstanceOf(NodeOperationError);
			expect(error.message).toContain(message);
			expect(calls).toHaveLength(0);
		});
	});

	it('shows stock problems reported by Fashion Cloud', async () => {
		const { error } = await runNodeExpectingError({
			params: withFields({ products: { product: [{ gtin: '4044816620478', quantity: 1000 }] } }),
			api,
		});

		expect(error).toBeInstanceOf(NodeApiError);
		expect(error.description).toBe(
			'OrderingProcessError: The order could not be processed\n' +
				'- There is not enough stock available for this product ' +
				'(type=InsufficientQuantity, orderedQuantity=1000, availableQuantity=120, gtin=4044816620478)',
		);
	});
});

describe('Order → Create (JSON)', () => {
	const jsonOrder = { resource: 'order', operation: 'create', specifyOrder: 'json' };
	const body = {
		type: 'endless-aisle',
		clientType: 'erp',
		clientId: 'client-1',
		products: [{ gtin: '4044816620478', quantity: 1 }],
		shippingAddress: shippingAddress.address,
	};

	it('sends the JSON body as is', async () => {
		const { calls } = await runNode({
			params: { ...jsonOrder, isTest: true, orderJson: JSON.stringify(body) },
			api,
		});

		expect(calls[0].body).toEqual({ ...body, isTest: true });
	});

	it('lets the Test Order toggle override isTest in the JSON', async () => {
		const { calls } = await runNode({
			params: { ...jsonOrder, isTest: true, orderJson: { ...body, isTest: false } },
			api,
		});

		expect((calls[0].body as IDataObject).isTest).toBe(true);
	});

	it('does not drop isTest from the JSON when the Test Order toggle resolves to nothing', async () => {
		const { error, calls } = await runNodeExpectingError({
			params: { ...jsonOrder, isTest: undefined, orderJson: { ...body, isTest: true } },
			api,
		});

		expect(error.message).toBe('"Test Order" must be true or false');
		expect(error.description).toContain('It resolved to an empty value');
		expect(calls).toHaveLength(0);
	});

	it('rejects JSON that is not an object', async () => {
		const { error, calls } = await runNodeExpectingError({
			params: { ...jsonOrder, isTest: true, orderJson: '[1, 2]' },
			api,
		});

		expect(error.message).toBe('"Order (JSON)" must be a JSON object');
		expect(calls).toHaveLength(0);
	});

	it('shows validation errors reported by Fashion Cloud', async () => {
		const { error } = await runNodeExpectingError({
			params: { ...jsonOrder, isTest: true, orderJson: '{"products": []}' },
			api,
		});

		expect(error.description).toBe(
			'ValidationError: The provided parameters are invalid\n' +
				'- Field should not be empty (field=products, type=isEmpty)\n' +
				'- Field should be present (field=clientId, type=isNotPresent)\n' +
				'- Field should be present (field=shippingAddress, type=isNotPresent)',
		);
	});
});
