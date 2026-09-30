import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class FashionCloudApi implements ICredentialType {
	name = 'fashionCloudApi';
	displayName = 'Fashion Cloud API';
	icon: Icon = {
		light: 'file:../icons/fashionCloud.svg',
		dark: 'file:../icons/fashionCloud.dark.svg',
	};
	documentationUrl =
		'https://www.notion.so/fashioncloud/Fashion-Cloud-API-ed2b17970caf4782a666a2f0661bd701';
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
	];

	// The API expects the token as a query parameter on every request
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			qs: {
				token: '={{$credentials.token}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://api.fashion.cloud',
			url: '/v2/brands',
			qs: { limit: 1 },
		},
	};
}
