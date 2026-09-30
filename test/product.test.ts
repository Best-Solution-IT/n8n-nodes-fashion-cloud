import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';

import { createFakeApi, makeProducts } from './helpers/fakeApi';
import { runNode, runNodeExpectingError } from './helpers/run';

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

const api = createFakeApi({
	products: makeProducts(2500, 'brand-0001'),
	stock: { '4044816620478': 10 },
	images: { 'image-1': JPEG },
});

describe('Product → Get Many', () => {
	const getAll = { resource: 'product', operation: 'getAll', options: {} };

	it('pages through all products of a brand with the nextId cursor', async () => {
		const { output, calls } = await runNode({
			params: { ...getAll, returnAll: true, brand: 'brand-0001', productFilter: 'none' },
			api,
		});

		expect(output).toHaveLength(2500);
		expect(new Set(output.map((item) => item.json._id)).size).toBe(2500);
		// at most 1000 per page; the last page is short, so no extra request
		expect(calls.map((c) => [c.qs.afterId, c.qs.limit])).toEqual([
			[undefined, 1000],
			['product-00999', 1000],
			['product-01999', 1000],
		]);
	});

	it('filters by GTIN, optionally together with a brand', async () => {
		const { output, calls } = await runNode({
			params: {
				...getAll,
				returnAll: false,
				limit: 10,
				brand: 'brand-0001',
				productFilter: 'gtin',
				gtin: '4000000000042',
			},
			api,
		});

		expect(calls[0].qs).toEqual({ brand: 'brand-0001', gtin: '4000000000042', limit: 10 });
		expect(output.map((item) => item.json.gtin)).toEqual(['4000000000042']);
	});

	it('filters by article number without a brand', async () => {
		const { calls } = await runNode({
			params: {
				...getAll,
				returnAll: false,
				limit: 3,
				brand: '',
				productFilter: 'articleNumber',
				articleNumber: 'ART-1',
			},
			api,
		});

		expect(calls[0].qs).toEqual({ articleNumber: 'ART-1', limit: 3 });
	});

	it('requires a brand, GTIN or article number before calling the API', async () => {
		const { error, calls } = await runNodeExpectingError({
			params: { ...getAll, returnAll: true, brand: '', productFilter: 'none' },
			api,
		});

		expect(error).toBeInstanceOf(NodeOperationError);
		expect(error.message).toBe('A brand, GTIN or article number is required to list products');
		expect(calls).toHaveLength(0);
	});

	it('maps options to query parameters and converts Updated Since to UTC', async () => {
		const { calls } = await runNode({
			params: {
				...getAll,
				returnAll: false,
				limit: 1,
				brand: 'brand-0001',
				productFilter: 'none',
				options: {
					afterId: 'product-00010',
					lang: 'en',
					season: 'spring_summer',
					seasonYear: '2026',
					includePreliminary: false,
					includeProductsWithoutImages: true,
					updatedSince: '2026-03-01T12:00:00',
				},
			},
			api,
			timezone: 'Europe/Berlin',
		});

		expect(calls[0].qs).toEqual({
			brand: 'brand-0001',
			afterId: 'product-00010',
			lang: 'en',
			season: 'spring_summer',
			seasonYear: '2026',
			includePreliminary: false,
			includeProductsWithoutImages: true,
			updatedSince: '2026-03-01T11:00:00.000Z',
			limit: 1,
		});
	});

	it('rejects an invalid Updated Since date', async () => {
		const { error } = await runNodeExpectingError({
			params: {
				...getAll,
				returnAll: true,
				brand: 'brand-0001',
				productFilter: 'none',
				options: { updatedSince: 'yesterday-ish' },
			},
			api,
		});

		expect(error.message).toBe('Invalid "Updated Since" date: yesterday-ish');
	});
});

describe('Product → Get Image', () => {
	const getImage = {
		resource: 'product',
		operation: 'getImage',
		imageId: 'image-1',
		binaryPropertyName: 'photo',
	};

	it('downloads the image as binary data', async () => {
		const { output, calls } = await runNode({
			params: {
				...getImage,
				imageOptions: { px: '512', minAcceptableSize: '200', watermark: false },
			},
			api,
		});

		expect(calls[0]).toMatchObject({
			url: '/v2/products/media/images/image-1',
			qs: { px: '512', minAcceptableSize: '200', watermark: false },
			json: false,
			encoding: 'arraybuffer',
			returnFullResponse: true,
		});
		expect(output).toEqual([
			{
				json: { imageId: 'image-1', px: '512', minAcceptableSize: '200', watermark: false },
				binary: {
					photo: {
						data: JPEG.toString('base64'),
						fileName: 'image-1_512.jpg',
						mimeType: 'image/jpeg',
					},
				},
				pairedItem: { item: 0 },
			},
		]);
	});

	it('requests the original size when no size is set', async () => {
		const { output, calls } = await runNode({ params: { ...getImage, imageOptions: {} }, api });

		expect(calls[0].qs).toEqual({});
		expect(output[0].binary?.photo.fileName).toBe('image-1.jpg');
	});

	it('requires "Size" when "Minimum Acceptable Size" is set', async () => {
		const { error, calls } = await runNodeExpectingError({
			params: { ...getImage, imageOptions: { minAcceptableSize: '200' } },
			api,
		});

		expect(error.message).toBe('"Minimum Acceptable Size" only works together with "Size"');
		expect(calls).toHaveLength(0);
	});

	it('rejects an empty image ID', async () => {
		const { error } = await runNodeExpectingError({
			params: { ...getImage, imageId: '  ', imageOptions: {} },
			api,
		});

		expect(error.message).toBe('Image ID must not be empty');
	});

	it('reports a missing image with the API message', async () => {
		const { error } = await runNodeExpectingError({
			params: { ...getImage, imageId: 'missing', imageOptions: {} },
			api,
		});

		expect(error).toBeInstanceOf(NodeApiError);
		expect(error.description).toBe('NotFoundError: This resource could not be found.');
	});
});

describe('Product → Get Stock', () => {
	it('returns stock and delivery time together with the GTIN', async () => {
		const { output, calls } = await runNode({
			params: { resource: 'product', operation: 'getStock', stockGtin: ' 4044816620478 ' },
			api,
		});

		expect(calls[0]).toMatchObject({ method: 'GET', url: '/v2/products/4044816620478/stock' });
		expect(output).toEqual([
			{
				json: {
					gtin: '4044816620478',
					stock: 10,
					deliveryTime: { minimum: 2, maximum: 3 },
					created: '2016-12-01T01:00:00.000Z',
					updated: '2016-12-02T01:00:00.000Z',
				},
				pairedItem: { item: 0 },
			},
		]);
	});

	it('URL-encodes the GTIN', async () => {
		const { calls } = await runNodeExpectingError({
			params: { resource: 'product', operation: 'getStock', stockGtin: '12/34' },
			api,
		});

		expect(calls[0].url).toBe('/v2/products/12%2F34/stock');
	});

	it('reports unknown GTINs with the API message', async () => {
		const { error } = await runNodeExpectingError({
			params: { resource: 'product', operation: 'getStock', stockGtin: '0000000000000' },
			api,
		});

		expect(error.description).toBe('InvalidParametersError: The provided parameters are illegal.');
	});
});
