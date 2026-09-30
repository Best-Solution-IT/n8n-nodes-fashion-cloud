import { describe, expect, it } from 'vitest';

import { FashionCloudApi } from '../credentials/FashionCloudApi.credentials';

describe('FashionCloudApi credential', () => {
	const credential = new FashionCloudApi();

	it('sends the token as the "token" query parameter, as the API requires', () => {
		expect(credential.authenticate).toEqual({
			type: 'generic',
			properties: { qs: { token: '={{$credentials.token}}' } },
		});
	});

	it('stores the token as a password field', () => {
		const token = credential.properties.find((property) => property.name === 'token');
		expect(token).toMatchObject({
			type: 'string',
			required: true,
			typeOptions: { password: true },
		});
	});

	it('has a Base URL field defaulting to the Fashion Cloud API', () => {
		const baseUrl = credential.properties.find((property) => property.name === 'baseUrl');
		expect(baseUrl).toMatchObject({
			type: 'string',
			required: true,
			default: 'https://api.fashion.cloud',
		});
	});

	it('tests the credential with a cheap brands request against the Base URL', () => {
		expect(credential.test.request).toEqual({
			baseURL: '={{$credentials.baseUrl || "https://api.fashion.cloud"}}',
			url: '/v2/brands',
			qs: { limit: 1 },
		});
	});
});
