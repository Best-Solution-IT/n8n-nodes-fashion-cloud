import { describe, expect, it } from 'vitest';

import { createFakeApi, makePrices } from './helpers/fakeApi';
import { resourceLocator } from './helpers/context';
import { runNode, runNodeExpectingError } from './helpers/run';

const api = createFakeApi({ prices: makePrices(450) });

const getAll = {
	resource: 'price',
	operation: 'getAll',
	brand: resourceLocator('brand-0001'),
	priceOptions: {},
};

describe('Price → Get Many', () => {
	it('pages through all prices with the nextId cursor', async () => {
		const { output, calls } = await runNode({ params: { ...getAll, returnAll: true }, api });

		expect(output).toHaveLength(450);
		expect(output[0].json).toEqual({
			gtin: '8000000000000',
			currency: 'EUR',
			purchasePrice: 33.31,
			recommendedRetailPrice: 89.95,
		});
		// the documented path has a trailing slash; at most 200 per page
		expect(calls.map((c) => [c.url, c.qs.afterId, c.qs.limit])).toEqual([
			['/v2/products/prices/', undefined, 200],
			['/v2/products/prices/', 'price-00199', 200],
			['/v2/products/prices/', 'price-00399', 200],
		]);
	});

	it('sends the brand and normalises the GTIN list', async () => {
		const { output, calls } = await runNode({
			params: {
				...getAll,
				returnAll: false,
				limit: 10,
				priceOptions: { gtins: ' 8000000000001 , 8000000000003,, ' },
			},
			api,
		});

		expect(calls[0].qs).toEqual({
			brand: 'brand-0001',
			gtins: '8000000000001,8000000000003',
			limit: 10,
		});
		expect(output.map((item) => item.json.gtin)).toEqual(['8000000000001', '8000000000003']);
	});

	it('passes Start After ID and Updated Since', async () => {
		const { calls } = await runNode({
			params: {
				...getAll,
				returnAll: false,
				limit: 1,
				priceOptions: { afterId: 'price-00100', updatedSince: '2026-01-01T00:00:00' },
			},
			api,
			timezone: 'Europe/Berlin',
		});

		expect(calls[0].qs).toMatchObject({
			afterId: 'price-00100',
			updatedSince: '2025-12-31T23:00:00.000Z',
		});
	});

	it('requires a brand before calling the API', async () => {
		const { error, calls } = await runNodeExpectingError({
			params: { ...getAll, brand: resourceLocator(''), returnAll: true },
			api,
		});

		expect(error.message).toBe('A brand is required to list prices');
		expect(calls).toHaveLength(0);
	});
});
