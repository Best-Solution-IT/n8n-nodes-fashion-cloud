import {
	IAuthenticateGeneric,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class FashionCloudApi implements ICredentialType {
	name = 'fashionCloudApi';
	displayName = 'Fashion Cloud API';
	documentationUrl = 'https://api.fashion.cloud';
	properties: INodeProperties[] = [
		{
			displayName: 'API Token',
			name: 'token',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description: 'Your Fashion Cloud API token',
		},
	];
	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			qs: {
				token: '={{$credentials.token}}',
			},
		},
	};
}
