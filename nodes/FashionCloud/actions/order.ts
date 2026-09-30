import {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	NodeOperationError,
} from 'n8n-workflow';

import { fashionCloudApiRequest, parseJsonParameter, toExecutionData } from '../GenericFunctions';

const MAX_PRODUCTS = 1000;
const REQUIRED_SHIPPING_FIELDS = ['gln', 'name', 'address1', 'zip', 'city', 'country'];

/** Drops empty strings so optional fields that were added but left blank aren't sent */
function compact(values: IDataObject | undefined): IDataObject {
	const result: IDataObject = {};
	for (const [key, value] of Object.entries(values ?? {})) {
		if (value !== '' && value !== undefined && value !== null) result[key] = value;
	}
	return result;
}

/**
 * Reads "Test Order". Only an explicit true/false is accepted: an expression that
 * resolves to nothing must not turn a test order into a real one.
 */
function getIsTest(this: IExecuteFunctions, itemIndex: number): boolean {
	const value: unknown = this.getNodeParameter('isTest', itemIndex, null);
	if (typeof value === 'boolean') return value;
	if (typeof value === 'string') {
		const text = value.trim().toLowerCase();
		if (text === 'true') return true;
		if (text === 'false') return false;
	}

	const got =
		value === undefined || value === null || value === '' ? 'an empty value' : `"${String(value)}"`;
	throw new NodeOperationError(this.getNode(), '"Test Order" must be true or false', {
		itemIndex,
		description: `It resolved to ${got}, so no order was sent. If the value comes from an expression, make sure it returns a boolean.`,
	});
}

function normaliseProducts(
	this: IExecuteFunctions,
	products: unknown,
	itemIndex: number,
): IDataObject[] {
	if (!Array.isArray(products) || products.length === 0) {
		throw new NodeOperationError(this.getNode(), 'At least one product is required', {
			itemIndex,
		});
	}
	if (products.length > MAX_PRODUCTS) {
		throw new NodeOperationError(
			this.getNode(),
			`An order can contain at most ${MAX_PRODUCTS} products (got ${products.length})`,
			{ itemIndex },
		);
	}

	return products.map((product: IDataObject, index) => {
		const gtin = String(product?.gtin ?? '').trim();
		const quantity = Number(product?.quantity);
		if (!gtin) {
			throw new NodeOperationError(this.getNode(), `Product ${index + 1} has no GTIN`, {
				itemIndex,
			});
		}
		if (!Number.isInteger(quantity) || quantity < 1) {
			throw new NodeOperationError(
				this.getNode(),
				`Product ${index + 1} (${gtin}) needs a whole-number quantity of at least 1`,
				{ itemIndex },
			);
		}
		return { gtin, quantity };
	});
}

function buildOrderFromFields(this: IExecuteFunctions, i: number): IDataObject {
	const clientId = String(this.getNodeParameter('clientId', i)).trim();
	const debitorGln = String(this.getNodeParameter('debitorGln', i)).trim();
	const productsInput = this.getNodeParameter('productsInput', i) as string;
	const shippingAddress = compact(
		(this.getNodeParameter('shippingAddress', i, {}) as IDataObject).address as IDataObject,
	);
	const additionalFields = this.getNodeParameter('additionalFields', i, {}) as IDataObject;

	if (!clientId) {
		throw new NodeOperationError(this.getNode(), 'Client ID must not be empty', { itemIndex: i });
	}
	if (!debitorGln) {
		throw new NodeOperationError(this.getNode(), 'Debitor GLN must not be empty', {
			itemIndex: i,
		});
	}
	const missing = REQUIRED_SHIPPING_FIELDS.filter((field) => !shippingAddress[field]);
	if (missing.length) {
		throw new NodeOperationError(
			this.getNode(),
			`Shipping address is missing: ${missing.join(', ')}`,
			{ itemIndex: i },
		);
	}

	const rawProducts =
		productsInput === 'json'
			? parseJsonParameter.call(
					this,
					this.getNodeParameter('productsJson', i),
					'Products (JSON)',
					i,
				)
			: ((this.getNodeParameter('products', i, {}) as IDataObject).product ?? []);

	const order: IDataObject = {
		type: 'endless-aisle',
		clientType: 'erp',
		clientId,
		products: normaliseProducts.call(this, rawProducts, i),
		debitor: {
			...compact((additionalFields.debitor as IDataObject)?.details as IDataObject),
			gln: debitorGln,
		},
		shippingAddress,
	};

	const billingAddress = compact(
		(additionalFields.billingAddress as IDataObject)?.address as IDataObject,
	);
	if (Object.keys(billingAddress).length) order.billingAddress = billingAddress;

	const endCustomer = compact(
		(additionalFields.endCustomer as IDataObject)?.customer as IDataObject,
	);
	if (Object.keys(endCustomer).length) order.endCustomer = endCustomer;

	if (additionalFields.useDropshipping !== undefined) {
		order.useDropshipping = additionalFields.useDropshipping;
	}

	return order;
}

export async function create(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
	const isTest = getIsTest.call(this, i);
	const specifyOrder = this.getNodeParameter('specifyOrder', i) as string;

	let order: IDataObject;
	if (specifyOrder === 'json') {
		const parsed = parseJsonParameter.call(
			this,
			this.getNodeParameter('orderJson', i),
			'Order (JSON)',
			i,
		);
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			throw new NodeOperationError(this.getNode(), '"Order (JSON)" must be a JSON object', {
				itemIndex: i,
			});
		}
		order = { ...(parsed as IDataObject) };
	} else {
		order = buildOrderFromFields.call(this, i);
	}

	// The "Test Order" toggle always wins, so a JSON body can't accidentally place a real order
	order.isTest = isTest;

	const response = (await fashionCloudApiRequest.call(
		this,
		'POST',
		'/v2/orders',
		{},
		order,
	)) as IDataObject;

	return toExecutionData.call(this, { ...response, isTest }, i);
}
