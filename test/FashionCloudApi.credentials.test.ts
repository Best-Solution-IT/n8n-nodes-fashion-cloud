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

	it('tests the credential with a cheap brands request', () => {
		expect(credential.test.request).toEqual({
			baseURL: 'https://api.fashion.cloud',
			url: '/v2/brands',
			qs: { limit: 1 },
		});
	});
});
