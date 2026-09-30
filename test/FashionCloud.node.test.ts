import type { INodeProperties } from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import { describe, expect, it } from 'vitest';

import { handlers } from '../nodes/FashionCloud/actions';
import { FashionCloud } from '../nodes/FashionCloud/FashionCloud.node';
import { createLoadOptionsContext } from './helpers/context';
import { createFakeApi, makeBrands } from './helpers/fakeApi';
import { runNode, runNodeExpectingError } from './helpers/run';

const { description } = new FashionCloud();

function optionValues(property: INodeProperties | undefined): string[] {
	return (property?.options ?? []).map((option) => String((option as { value: unknown }).value));
}

describe('node description', () => {
	const resourceProperty = description.properties.find((p) => p.name === 'resource');
	const resources = optionValues(resourceProperty);

	it('has an implementation for every operation shown in the UI, and nothing else', () => {
		const shown = resources.flatMap((resource) =>
			optionValues(
				description.properties.find(
					(p) => p.name === 'operation' && p.displayOptions?.show?.resource?.includes(resource),
				),
			).map((operation) => `${resource}.${operation}`),
		);
		const implemented = Object.entries(handlers).flatMap(([resource, operations]) =>
			Object.keys(operations).map((operation) => `${resource}.${operation}`),
		);

		expect(shown.sort()).toEqual(implemented.sort());
	});

	it('only shows fields for resources and operations that exist', () => {
		for (const property of description.properties) {
			const show = property.displayOptions?.show;
			for (const resource of (show?.resource as string[] | undefined) ?? []) {
				expect(resources, `${property.name} → resource ${resource}`).toContain(resource);
				for (const operation of (show?.operation as string[] | undefined) ?? []) {
					expect(
						Object.keys(handlers[resource]),
						`${property.name} → ${resource}.${operation}`,
					).toContain(operation);
				}
			}
		}
	});

	it('uses the credential defined in this package', () => {
		expect(description.credentials).toEqual([{ name: 'fashionCloudApi', required: true }]);
	});
});

describe('execute', () => {
	const api = createFakeApi({ brands: makeBrands(3), stock: { '1': 5 } });

	it('processes every input item and pairs the output with it', async () => {
		const { output } = await runNode({
			params: { resource: 'product', operation: 'getStock', stockGtin: '1' },
			items: [{ json: {} }, { json: {} }],
			api,
		});

		expect(output.map((item) => item.pairedItem)).toEqual([{ item: 0 }, { item: 1 }]);
	});

	it('with Continue On Fail, reports failing items and keeps processing the rest', async () => {
		const { output } = await runNode({
			params: (i) => ({
				resource: 'product',
				operation: 'getStock',
				stockGtin: i === 0 ? '999' : '1',
			}),
			items: [{ json: {} }, { json: {} }],
			api,
			continueOnFail: true,
		});

		expect(output).toEqual([
			{
				json: {
					error: 'Bad request - please check your parameters',
					description: 'InvalidParametersError: The provided parameters are illegal.',
				},
				pairedItem: { item: 0 },
			},
			expect.objectContaining({
				json: expect.objectContaining({ gtin: '1', stock: 5 }),
				pairedItem: { item: 1 },
			}),
		]);
	});

	it('without Continue On Fail, stops with the API error', async () => {
		const { error } = await runNodeExpectingError({
			params: { resource: 'product', operation: 'getStock', stockGtin: '999' },
			api,
		});

		expect(error).toBeInstanceOf(NodeApiError);
		expect((error as NodeApiError).httpCode).toBe('400');
	});

	it('tells which item an API error belongs to', async () => {
		const { error, calls } = await runNodeExpectingError({
			params: (i) => ({
				resource: 'product',
				operation: 'getStock',
				stockGtin: i === 1 ? '999' : '1',
			}),
			items: [{ json: {} }, { json: {} }, { json: {} }],
			api,
		});

		expect(error).toBeInstanceOf(NodeApiError);
		expect(error.context?.itemIndex).toBe(1);
		// the item after the failing one is not processed
		expect(calls).toHaveLength(2);
	});

	it('tells which item an input error belongs to', async () => {
		const { error } = await runNodeExpectingError({
			params: (i) => ({
				resource: 'product',
				operation: 'getStock',
				stockGtin: i === 1 ? '..' : '1',
			}),
			items: [{ json: {} }, { json: {} }],
			api,
		});

		expect(error).toBeInstanceOf(NodeOperationError);
		expect(error.context?.itemIndex).toBe(1);
	});

	it('explains how to make a custom API call when "Custom API Call" is selected', async () => {
		// n8n hides the operation field for this option, so it must not be read
		const { error, calls } = await runNodeExpectingError({
			params: { resource: '__CUSTOM_API_CALL__' },
			api,
		});

		expect(error).toBeInstanceOf(NodeOperationError);
		expect(error.message).toBe('Custom API calls are made with the HTTP Request node');
		expect(error.description).toContain('"Predefined Credential Type"');
		expect(error.description).toContain('"Fashion Cloud API"');
		expect(calls).toHaveLength(0);
	});

	it('rejects unknown operations', async () => {
		const { error } = await runNodeExpectingError({
			params: { resource: 'brand', operation: 'delete' },
			api,
		});

		expect(error.message).toBe('Unsupported resource/operation: brand/delete');
	});
});

describe('brand dropdown (getBrands)', () => {
	it('loads all brands across pages, sorted by name', async () => {
		const { context, calls } = createLoadOptionsContext(createFakeApi({ brands: makeBrands(250) }));

		const options = await new FashionCloud().methods.loadOptions.getBrands.call(context);

		expect(options).toHaveLength(250);
		expect(options[0]).toEqual({ name: 'Brand 1', value: 'brand-0249' });
		expect(options.map((o) => o.name)).toEqual(
			[...options.map((o) => o.name)].sort((a, b) => a.localeCompare(b)),
		);
		expect(calls.map((c) => c.qs)).toEqual([
			{ offset: 0, limit: 200 },
			{ offset: 200, limit: 200 },
		]);
	});
});
