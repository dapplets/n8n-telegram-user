import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionType, NodeOperationError } from 'n8n-workflow';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { getMessages } from './get-messages';

export class TelegramUser implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Telegram User',
		name: 'telegramUser',
		icon: 'file:telegram.svg',
		group: ['transform'],
		version: 11,
		description: 'Read Telegram user channels',
		defaults: {
			name: 'Telegram User',
		},
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		credentials: [
			{
				name: 'telegramUserCredentialsApi',
				required: true,
				testedBy: 'testCredentials',
			},
		],
		properties: [
			{
				displayName: 'Channel Name',
				name: 'channelName',
				type: 'string',
				default: '',
				description: 'Channel Name to get messages from',
			},
			{
				displayName: 'Last Message ID',
				name: 'lastMessageId',
				type: 'number',
				default: 0,
				description: 'Last message ID to get messages from',
			},
			{
				displayName: 'Is New',
				name: 'isNew',
				type: 'boolean',
				default: false,
				description: 'Whether the channel is new to the user',
			},
		],
	};

	async testCredentials(credentials: { session: string; apiId: number; apiHash: string }) {
		if (credentials.session && credentials.apiId && credentials.apiHash) {
			return { status: 'OK', message: 'Connection successful!' };
		} else {
			return { status: 'Error', message: 'Credentials are empty' };
		}
	}

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const creds = await this.getCredentials('telegramUserCredentialsApi');
		if (!creds || !creds.session || !creds.apiId || !creds.apiHash) {
			throw new NodeOperationError(this.getNode(), 'No credentials got returned!');
		}

		const stringSession = new StringSession(creds.session as string);
		const client = new TelegramClient(
			stringSession,
			creds.apiId as number,
			creds.apiHash as string,
			{
				connectionRetries: 5,
			},
		);
		await client.connect();
		const dialogs = await client.getDialogs({});

		const items = this.getInputData();
		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			let item = items[itemIndex];
			try {
				const channelName = this.getNodeParameter('channelName', itemIndex, '') as string;
				const lastMessageId = this.getNodeParameter('lastMessageId', itemIndex, 0) as number;
				const isNew = this.getNodeParameter('isNew', itemIndex, false) as boolean;

				item.json.result = await getMessages({
					client,
					dialogs,
					channelName,
					lastMessageId,
					isNew,
				});
			} catch (error) {
				if (this.continueOnFail()) {
					items.push({ json: item, error, pairedItem: itemIndex });
				} else {
					if (error.context) {
						error.context.itemIndex = itemIndex;
						throw error;
					}
					throw new NodeOperationError(this.getNode(), error, {
						itemIndex,
					});
				}
			}
		}

		return [items];
	}
}
