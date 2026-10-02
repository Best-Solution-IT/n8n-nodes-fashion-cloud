import type {
	IAuthenticate,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	IHttpRequestOptions,
	INodeProperties,
} from 'n8n-workflow';
import { UserError } from 'n8n-workflow';

const PRIVATE_IPV4 =
	/^(127|10)(\.\d+){3}$|^192\.168(\.\d+){2}$|^172\.(1[6-9]|2\d|3[01])(\.\d+){2}$/;
// Single-label names (e.g. Docker service names) and suffixes reserved for private use
const LOCAL_NAME = /^[^.[\]]+$|\.(localhost|local|internal|test)$/;

/**
 * The token travels in the query string, so plain http:// is only acceptable for hosts
 * that can't be on the public internet, e.g. a mock server on localhost.
 */
export function isUnencryptedPublicUrl(url: string, baseURL?: string): boolean {
	let parsed: URL;
	try {
		parsed = new URL(url, baseURL);
	} catch {
		return false;
	}
	if (parsed.protocol !== 'http:') return false;
	const host = parsed.hostname.toLowerCase();
	return !(host === '[::1]' || PRIVATE_IPV4.test(host) || LOCAL_NAME.test(host));
}

export class FashionCloudApi implements ICredentialType {
	name = 'fashionCloudApi';
	displayName = 'Fashion Cloud API';
	icon: Icon = {
		light: 'file:../icons/fashionCloud.svg',
		dark: 'file:../icons/fashionCloud.dark.svg',
	};
	documentationUrl = 'https://docs.api.fashion.cloud/#fashion-cloud-api-v2';
	properties: INodeProperties[] = [
		{
			displayName: 'API Token',
			name: 'token',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Your Fashion Cloud API token. Your account must be enabled for API access by Fashion Cloud.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.fashion.cloud',
			required: true,
			description:
				'Only change this to test against a mock or staging server, e.g. http://host.docker.internal:4010 when n8n runs in Docker. Without "/v2"; the token is sent to this server. http:// is only accepted for local servers.',
		},
	];

	// The API expects the token as a query parameter on every request. This is a function
	// rather than the declarative form so the token is never added to an unencrypted
	// request, wherever the address comes from (Base URL or the HTTP Request node).
	authenticate: IAuthenticate = async (credentials, requestOptions) => {
		// The HTTP Request node passes the address as `uri`
		const { url, uri, baseURL } = requestOptions as IHttpRequestOptions & { uri?: string };
		const target = url ?? uri;
		if (typeof target === 'string' && isUnencryptedPublicUrl(target, baseURL)) {
			throw new UserError(
				'The Fashion Cloud token is not sent over http://. Use https://, or http:// only for a local mock server.',
			);
		}
		return { ...requestOptions, qs: { ...requestOptions.qs, token: credentials.token } };
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl || "https://api.fashion.cloud"}}',
			url: '/v2/brands',
			qs: { limit: 1 },
		},
	};
}
