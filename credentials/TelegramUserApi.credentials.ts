import {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class TelegramUserApi implements ICredentialType {
	name = 'telegramUserCredentialsApi';
	displayName = 'Telegram User Credentials API';
	documentationUrl = 'https://github.com/Ni-2/n8n-telergam-user';
	properties: INodeProperties[] = [
		{
			displayName: 'Session',
			name: 'session',
			type: 'string',
			default: '',
			required: true,
		},
		{
			displayName: 'API ID',
			name: 'apiId',
			type: 'number',
			default: 0,
			required: true,
		},
		{
			displayName: 'API hash',
			name: 'apiHash',
			type: 'string',
			default: '',
			required: true,
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			qs: {
				// Send this as part of the query string
				n8n: 'rocks',
			},
		},
	};

	// The block below tells how this credential can be tested
	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://example.com/',
			url: '',
		},
	};
}
