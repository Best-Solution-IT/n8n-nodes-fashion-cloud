import { describe, expect, it } from 'vitest';

import type { IAuthenticateGeneric, IHttpRequestOptions } from 'n8n-workflow';

import {
	FashionCloudApi,
	isUnencryptedPublicUrl,
} from '../credentials/FashionCloudApi.credentials';

type AuthenticateFunction = Exclude<FashionCloudApi['authenticate'], IAuthenticateGeneric>;

describe('FashionCloudApi credential', () => {
	const credential = new FashionCloudApi();

	const authenticate = (options: Record<string, unknown>) =>
		(credential.authenticate as AuthenticateFunction)(
			{ token: 'secret' },
			options as unknown as IHttpRequestOptions,
		);

	it('sends the token as the "token" query parameter, as the API requires', async () => {
		await expect(
			authenticate({ baseURL: 'https://api.fashion.cloud', url: '/v2/brands', qs: { limit: 1 } }),
		).resolves.toEqual({
			baseURL: 'https://api.fashion.cloud',
			url: '/v2/brands',
			qs: { limit: 1, token: 'secret' },
		});
	});

	it('adds the token to requests without a query, e.g. from the HTTP Request node', async () => {
		await expect(authenticate({ uri: 'https://api.fashion.cloud/v2/brands' })).resolves.toEqual({
			uri: 'https://api.fashion.cloud/v2/brands',
			qs: { token: 'secret' },
		});
	});

	it('adds the token for a local mock server over http://', async () => {
		const options = await authenticate({ baseURL: 'http://localhost:4010', url: '/v2/brands' });
		expect(options.qs).toEqual({ token: 'secret' });
	});

	it.each([
		[{ baseURL: 'http://api.fashion.cloud', url: '/v2/brands' }],
		[{ url: 'http://api.fashion.cloud/v2/brands' }],
		[{ uri: 'http://api.fashion.cloud/v2/brands' }],
	])('refuses to send the token unencrypted to a public host: %j', async (options) => {
		await expect(authenticate(options)).rejects.toThrow(
			'The Fashion Cloud token is not sent over http://',
		);
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

	it('mentions in the Base URL description that http:// is for local servers only', () => {
		const baseUrl = credential.properties.find((property) => property.name === 'baseUrl');
		expect(baseUrl?.description).toContain('http:// is only accepted for local servers');
	});

	it('tests the credential with a cheap brands request against the Base URL', () => {
		expect(credential.test.request).toEqual({
			baseURL: '={{$credentials.baseUrl || "https://api.fashion.cloud"}}',
			url: '/v2/brands',
			qs: { limit: 1 },
		});
	});
});

describe('isUnencryptedPublicUrl', () => {
	it.each([
		['https://api.fashion.cloud'],
		['https://staging.example.com/api'],
		// plain http is fine for hosts that can't be on the public internet
		['http://localhost:4010'],
		['http://LOCALHOST'],
		['http://127.0.0.1:4010'],
		['http://[::1]:4010'],
		['http://host.docker.internal:4010'],
		['http://mock:4010'],
		['http://mock.test'],
		['http://nas.local'],
		['http://10.0.0.5'],
		['http://192.168.1.20:8080'],
		['http://172.16.0.1'],
		['http://172.31.255.255'],
		// not a URL: nothing to decide here
		['/v2/brands'],
	])('accepts %s', (url) => {
		expect(isUnencryptedPublicUrl(url)).toBe(false);
	});

	it.each([
		['http://api.fashion.cloud'],
		['HTTP://API.FASHION.CLOUD/v2/brands'],
		['http://staging.example.com:8080'],
		['http://8.8.8.8'],
		['http://172.32.0.1'],
		['http://192.169.1.1'],
		['http://[2001:db8::1]'],
		// numeric spelling of 8.8.8.8
		['http://134744072'],
		['http://localhost.example.com'],
	])('rejects %s', (url) => {
		expect(isUnencryptedPublicUrl(url)).toBe(true);
	});

	it('resolves a path against the base URL', () => {
		expect(isUnencryptedPublicUrl('/v2/brands', 'http://api.fashion.cloud')).toBe(true);
		expect(isUnencryptedPublicUrl('/v2/brands', 'http://localhost:4010')).toBe(false);
		// an absolute address wins over the base URL
		expect(isUnencryptedPublicUrl('http://example.com/x', 'https://api.fashion.cloud')).toBe(true);
	});
});
