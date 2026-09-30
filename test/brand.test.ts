import { describe, expect, it } from 'vitest';

import { createFakeApi, makeBrands } from './helpers/fakeApi';
import { runNode } from './helpers/run';

const api = createFakeApi({ brands: makeBrands(450) });

describe('Brand → Get Many', () => {
	it('returns every brand as its own item when Return All is on', async () => {
		const { output, calls } = await runNode({
			params: { resource: 'brand', operation: 'getAll', returnAll: true, filters: {} },
			api,
		});

		expect(output).toHaveLength(450);
		expect(output[0]).toEqual({
			json: expect.objectContaining({ _id: 'brand-0000' }),
			pairedItem: { item: 0 },
		});
		// the API allows at most 200 brands per page
		expect(calls.map((c) => [c.qs.offset, c.qs.limit])).toEqual([
			[0, 200],
			[200, 200],
			[400, 200],
		]);
	});

	it('stops at the limit', async () => {
		const { output, calls } = await runNode({
			params: { resource: 'brand', operation: 'getAll', returnAll: false, limit: 5, filters: {} },
			api,
		});

		expect(output).toHaveLength(5);
		expect(calls).toHaveLength(1);
		expect(calls[0].qs).toEqual({ offset: 0, limit: 5 });
	});

	it('filters by GLN', async () => {
		const { output, calls } = await runNode({
			params: {
				resource: 'brand',
				operation: 'getAll',
				returnAll: true,
				filters: { gln: '4000000000007' },
			},
			api,
		});

		expect(calls[0].qs.gln).toBe('4000000000007');
		expect(output.map((item) => item.json._id)).toEqual(['brand-0007']);
	});
});
