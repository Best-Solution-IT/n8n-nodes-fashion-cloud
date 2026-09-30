import type { IDataObject } from 'n8n-workflow';

import { type ApiCall, type ApiHandler, apiError } from './context';

/**
 * In-memory Fashion Cloud API v2 following docs/fashion-cloud-api-v2.json:
 * page size limits, offset/cursor pagination, required filters and the
 * documented error bodies.
 */
export interface FakeData {
	brands?: IDataObject[];
	products?: IDataObject[];
	prices?: IDataObject[];
	/** Stock per GTIN, also used to reject orders with too little stock */
	stock?: Record<string, number>;
	/** Image bytes per image _id */
	images?: Record<string, Buffer>;
}

export const invalidParameters = () =>
	apiError(400, {
		type: 'InvalidParametersError',
		message: 'The provided parameters are illegal.',
	});

export function makeBrands(count: number): IDataObject[] {
	return Array.from({ length: count }, (_, i) => ({
		_id: `brand-${String(i).padStart(4, '0')}`,
		name: `Brand ${count - i}`,
		glns: [`40000000${String(i).padStart(5, '0')}`],
	}));
}

export function makeProducts(count: number, brandId = 'brand-0000'): IDataObject[] {
	return Array.from({ length: count }, (_, i) => ({
		_id: `product-${String(i).padStart(5, '0')}`,
		gtin: String(4000000000000 + i),
		articleNumber: `ART-${i % 10}`,
		brand: { _id: brandId },
	}));
}

export function makePrices(count: number): IDataObject[] {
	return Array.from({ length: count }, (_, i) => ({
		_id: `price-${String(i).padStart(5, '0')}`,
		gtin: String(8000000000000 + i),
		currency: 'EUR',
		purchasePrice: 33.31,
		recommendedRetailPrice: 89.95,
	}));
}

function pageLimit(qs: IDataObject, max: number): number {
	const limit = qs.limit === undefined ? 200 : Number(qs.limit);
	if (!Number.isInteger(limit) || limit < 1 || limit > max) throw invalidParameters();
	return limit;
}

function cursorPage(entries: IDataObject[], qs: IDataObject, max: number): IDataObject {
	const limit = pageLimit(qs, max);
	const start = qs.afterId ? entries.findIndex((entry) => entry._id === qs.afterId) + 1 : 0;
	const data = entries.slice(start, start + limit);
	return {
		...(qs.afterId ? { afterId: qs.afterId } : {}),
		// Like the real API, a nextId is returned whenever the page has entries
		nextId: data.length ? data[data.length - 1]._id : undefined,
		limit,
		totalElements: entries.length,
		data,
	};
}

function listBrands(data: FakeData, qs: IDataObject) {
	const limit = pageLimit(qs, 200);
	const offset = qs.offset === undefined ? 0 : Number(qs.offset);
	const brands = (data.brands ?? []).filter(
		(brand) => !qs.gln || (brand.glns as string[]).includes(String(qs.gln)),
	);
	return {
		offset,
		limit,
		totalElements: brands.length,
		data: brands.slice(offset, offset + limit),
	};
}

function listProducts(data: FakeData, qs: IDataObject) {
	if (!qs.brand && !qs.gtin && !qs.articleNumber) throw invalidParameters();
	if (qs.gtin && qs.articleNumber) throw invalidParameters();
	const products = (data.products ?? []).filter(
		(product) =>
			(!qs.brand || (product.brand as IDataObject)._id === qs.brand) &&
			(!qs.gtin || product.gtin === qs.gtin) &&
			(!qs.articleNumber || product.articleNumber === qs.articleNumber),
	);
	return cursorPage(products, qs, 1000);
}

function listPrices(data: FakeData, qs: IDataObject) {
	if (!qs.brand) throw invalidParameters();
	const gtins = qs.gtins ? String(qs.gtins).split(',') : undefined;
	const prices = (data.prices ?? []).filter(
		(price) => !gtins || gtins.includes(String(price.gtin)),
	);
	const page = cursorPage(prices, qs, 200);
	// Price entries carry no _id in the real response
	page.data = (page.data as IDataObject[]).map((price) => {
		const withoutId = { ...price };
		delete withoutId._id;
		return withoutId;
	});
	return page;
}

function createOrder(data: FakeData, body: IDataObject) {
	const errors: IDataObject[] = [];
	const products = body.products as IDataObject[] | undefined;
	if (!Array.isArray(products) || !products.length) {
		errors.push({ field: 'products', type: 'isEmpty', message: 'Field should not be empty' });
	}
	if (!body.clientId) {
		errors.push({ field: 'clientId', type: 'isNotPresent', message: 'Field should be present' });
	}
	if (!body.shippingAddress) {
		errors.push({
			field: 'shippingAddress',
			type: 'isNotPresent',
			message: 'Field should be present',
		});
	}
	if (errors.length) {
		throw apiError(400, {
			type: 'ValidationError',
			message: 'The provided parameters are invalid',
			errors,
		});
	}

	const stockErrors = (products ?? [])
		.filter(
			(product) => (data.stock?.[String(product.gtin)] ?? Infinity) < Number(product.quantity),
		)
		.map((product) => ({
			type: 'InsufficientQuantity',
			message: 'There is not enough stock available for this product',
			orderedQuantity: product.quantity,
			availableQuantity: data.stock?.[String(product.gtin)],
			gtin: product.gtin,
		}));
	if (stockErrors.length) {
		throw apiError(400, {
			type: 'OrderingProcessError',
			message: 'The order could not be processed',
			errors: stockErrors,
		});
	}

	return { _id: '123456', orderNumber: 'FC2345812', status: 'open' };
}

export function createFakeApi(data: FakeData = {}): ApiHandler {
	return (call: ApiCall) => {
		if (call.credentialType !== 'fashionCloudApi') throw new Error('Unexpected credential type');
		const { method = 'GET', url, qs } = call;

		if (method === 'GET' && url === '/v2/brands') return listBrands(data, qs);
		if (method === 'GET' && url === '/v2/products') return listProducts(data, qs);
		if (method === 'GET' && url === '/v2/products/prices/') return listPrices(data, qs);
		if (method === 'POST' && url === '/v2/orders')
			return createOrder(data, call.body as IDataObject);

		const stock = url.match(/^\/v2\/products\/([^/]+)\/stock$/);
		if (method === 'GET' && stock) {
			const gtin = decodeURIComponent(stock[1]);
			if (data.stock?.[gtin] === undefined) throw invalidParameters();
			return {
				stock: data.stock[gtin],
				deliveryTime: { minimum: 2, maximum: 3 },
				created: '2016-12-01T01:00:00.000Z',
				updated: '2016-12-02T01:00:00.000Z',
			};
		}

		const image = url.match(/^\/v2\/products\/media\/images\/([^/]+)$/);
		if (method === 'GET' && image) {
			const bytes = data.images?.[decodeURIComponent(image[1])];
			if (!bytes) {
				// Binary requests receive the error body as a Buffer
				throw apiError(
					404,
					Buffer.from(
						JSON.stringify({ type: 'NotFoundError', message: 'This resource could not be found.' }),
					),
				);
			}
			return { body: bytes, headers: { 'content-type': 'image/jpeg' }, statusCode: 200 };
		}

		throw apiError(404, { type: 'NotFoundError', message: `No fake route for ${method} ${url}` });
	};
}
