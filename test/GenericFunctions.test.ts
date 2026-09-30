import { NodeApiError } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';

import {
	BASE_URL,
	fashionCloudApiRequest,
	fashionCloudApiRequestAllItems,
	toIsoDate,
} from '../nodes/FashionCloud/GenericFunctions';
import { apiError, createExecuteContext } from './helpers/context';

describe('toIsoDate', () => {
	it.each([
		// wall-clock values are interpreted in the given timezone (DST-aware)
		['2025-01-01T10:00:00', 'Europe/Berlin', '2025-01-01T09:00:00.000Z'],
		['2025-07-01T10:00:00', 'Europe/Berlin', '2025-07-01T08:00:00.000Z'],
		['2025-01-15T12:30:00', 'America/New_York', '2025-01-15T17:30:00.000Z'],
		// explicit offsets win over the timezone
		['2025-07-01T10:00:00.000+02:00', 'America/New_York', '2025-07-01T08:00:00.000Z'],
		['2025-07-01T10:00:00Z', 'Europe/Berlin', '2025-07-01T10:00:00.000Z'],
		// date only → midnight in the timezone
		['2025-07-01', 'UTC', '2025-07-01T00:00:00.000Z'],
	])('converts %s in %s to %s', (value, timeZone, expected) => {
		expect(toIsoDate(value, timeZone)).toBe(expected);
	});

	it.each(['', undefined, null, 'not a date'])('returns undefined for %j', (value) => {
		expect(toIsoDate(value, 'UTC')).toBeUndefined();
	});
});

describe('fashionCloudApiRequest', () => {
	it('sends JSON requests to the API base URL with the Fashion Cloud credential', async () => {
		const { context, calls } = createExecuteContext({ params: {}, api: () => ({ ok: true }) });

		await expect(
			fashionCloudApiRequest.call(context, 'GET', '/v2/brands', { limit: 1 }),
		).resolves.toEqual({ ok: true });

		expect(calls).toEqual([
			expect.objectContaining({
				credentialType: 'fashionCloudApi',
				method: 'GET',
				baseURL: BASE_URL,
				url: '/v2/brands',
				qs: { limit: 1 },
				json: true,
			}),
		]);
	});

	it('describes ValidationError responses field by field', async () => {
		const { context } = createExecuteContext({
			params: {},
			api: () => {
				throw apiError(400, {
					type: 'ValidationError',
					message: 'The provided parameters are invalid',
					errors: [{ field: 'clientId', type: 'isNotPresent', message: 'Field should be present' }],
				});
			},
		});

		const error = await fashionCloudApiRequest
			.call(context, 'POST', '/v2/orders', {}, {})
			.catch((e: unknown) => e);

		expect(error).toBeInstanceOf(NodeApiError);
		expect((error as NodeApiError).httpCode).toBe('400');
		expect((error as NodeApiError).description).toBe(
			'ValidationError: The provided parameters are invalid\n' +
				'- Field should be present (field=clientId, type=isNotPresent)',
		);
	});

	it('parses error bodies that arrive as a Buffer (binary requests)', async () => {
		const body = Buffer.from(JSON.stringify({ type: 'NotFoundError', message: 'Not here' }));
		const { context } = createExecuteContext({
			params: {},
			api: () => {
				throw apiError(404, body);
			},
		});

		const error = (await fashionCloudApiRequest
			.call(context, 'GET', '/v2/products/media/images/x')
			.catch((e: unknown) => e)) as NodeApiError;

		expect(error.description).toBe('NotFoundError: Not here');
		expect(error.message).toBe('The resource you are requesting could not be found');
	});

	it('still throws a NodeApiError when the error has no body', async () => {
		const { context } = createExecuteContext({
			params: {},
			api: () => {
				throw new Error('socket hang up');
			},
		});

		await expect(fashionCloudApiRequest.call(context, 'GET', '/v2/brands')).rejects.toBeInstanceOf(
			NodeApiError,
		);
	});
});

describe('fashionCloudApiRequestAllItems', () => {
	const pagesOf = (total: number) => (qs: Record<string, unknown>) => {
		const offset = Number(qs.offset ?? 0);
		const limit = Number(qs.limit);
		const data = Array.from({ length: Math.max(0, Math.min(limit, total - offset)) }, (_, i) => ({
			n: offset + i,
		}));
		return { offset, limit, totalElements: total, data };
	};

	it('follows offsets until totalElements is reached', async () => {
		const { context, calls } = createExecuteContext({
			params: {},
			api: (call) => pagesOf(400)(call.qs),
		});

		const items = await fashionCloudApiRequestAllItems.call(
			context,
			'/v2/brands',
			{},
			'offset',
			200,
		);

		expect(items).toHaveLength(400);
		// exactly two pages: the second one reaches totalElements, so no empty third request
		expect(calls.map((c) => [c.qs.offset, c.qs.limit])).toEqual([
			[0, 200],
			[200, 200],
		]);
	});

	it('requests only as many items as still needed', async () => {
		const { context, calls } = createExecuteContext({
			params: {},
			api: (call) => pagesOf(1000)(call.qs),
		});

		const items = await fashionCloudApiRequestAllItems.call(
			context,
			'/v2/brands',
			{ gln: '1' },
			'offset',
			200,
			250,
		);

		expect(items).toHaveLength(250);
		expect(calls.map((c) => c.qs)).toEqual([
			{ gln: '1', offset: 0, limit: 200 },
			{ gln: '1', offset: 200, limit: 50 },
		]);
	});

	it('follows nextId cursors and stops on an empty page', async () => {
		const ids = ['a', 'b', 'c', 'd'];
		const { context, calls } = createExecuteContext({
			params: {},
			api: ({ qs }) => {
				const start = qs.afterId ? ids.indexOf(String(qs.afterId)) + 1 : 0;
				const data = ids.slice(start, start + Number(qs.limit)).map((id) => ({ id }));
				return { nextId: data.length ? data[data.length - 1].id : undefined, data };
			},
		});

		const items = await fashionCloudApiRequestAllItems.call(
			context,
			'/v2/products',
			{},
			'cursor',
			2,
		);

		expect(items.map((i) => i.id)).toEqual(ids);
		expect(calls.map((c) => c.qs.afterId)).toEqual([undefined, 'b', 'd']);
	});

	it('stops when the API repeats the same cursor', async () => {
		const { context, calls } = createExecuteContext({
			params: {},
			api: () => ({ nextId: 'same', data: [{ id: 1 }, { id: 2 }] }),
		});

		await fashionCloudApiRequestAllItems.call(context, '/v2/products', {}, 'cursor', 2);

		expect(calls).toHaveLength(2);
	});

	it('starts from a given afterId cursor', async () => {
		const { context, calls } = createExecuteContext({
			params: {},
			api: () => ({ data: [] }),
		});

		await fashionCloudApiRequestAllItems.call(
			context,
			'/v2/products',
			{ afterId: 'x' },
			'cursor',
			10,
		);

		expect(calls[0].qs).toEqual({ afterId: 'x', limit: 10 });
	});
});
