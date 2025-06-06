import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionType, NodeOperationError } from 'n8n-workflow';
import { Api, TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';
import { Dialog } from 'telegram/tl/custom/dialog';

const getMessages = async ({
	client,
	dialog,
	isNew,
}: {
	client: TelegramClient;
	dialog: Dialog;
	isNew?: boolean;
}) => {
	let messages = null;
	if (dialog.entity?.className === 'Channel' || dialog.entity?.className === 'Chat') {
		let getMore = true;
		while (getMore) {
			const rawMessages = await client.getMessages(dialog.entity, {
				limit: 10,
				// offsetDate: Math.trunc((Date.now() - 1000 * 60 * 60) / 1000),
			});
			if (!rawMessages.length) break;
			if (
				rawMessages[rawMessages.length - 1].date < Math.trunc((Date.now() - 1000 * 60 * 60) / 1000)
			) {
				getMore = false;
			}
			messages = rawMessages
				.filter((m) => isNew || m.date >= Math.trunc((Date.now() - 1000 * 60 * 60) / 1000))
				.filter((m) => m.message)
				.map((m) => ({
					id: m.id,
					text: m.message,
					date: m.date,
					source: dialog.title,
					sourceId: dialog.id,
					sourceName: (dialog.entity as any)?.username,
					sourceType: dialog.isChannel
						? 'channel'
						: dialog.isGroup
							? 'group'
							: dialog.isUser
								? 'user'
								: 'unknown',
					privateChannel: !!(dialog.entity?.className === 'Channel' && !dialog.entity.username),
				}));
		}
	}
	return messages;
};

export class TelegramUser implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Telegram User',
		name: 'telegramUser',
		icon: 'file:telegram.svg',
		group: ['transform'],
		version: 6,
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
		const items = this.getInputData();
		const creds = await this.getCredentials('telegramUserCredentialsApi');

		if (!creds || !creds.session || !creds.apiId || !creds.apiHash) {
			throw new NodeOperationError(this.getNode(), 'No credentials got returned!');
		}

		let item: INodeExecutionData;
		let channelName: string;

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				item = items[itemIndex];
				channelName = this.getNodeParameter('channelName', itemIndex, '') as string;

				if (/^https:\/\/t.me\//.test(channelName)) {
					channelName = channelName.replace(/^https:\/\/t.me\//, '');
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
				let dialogs = await client.getDialogs({});

				const result = [];
				let messages = null;

				if (channelName) {
					let dialog = dialogs.find(
						(d) => d.title === channelName || (d.entity as any)?.username === channelName,
					);
					if (!dialog) {
						await client.invoke(
							new Api.channels.JoinChannel({
								channel: channelName,
							}),
						);
						dialogs = await client.getDialogs({});
						dialog = dialogs.find(
							(d) => d.title === channelName || (d.entity as any)?.username === channelName,
						);
						if (!dialog) {
							throw new NodeOperationError(this.getNode(), 'Channel not found');
						}
						messages = await getMessages({ client, dialog, isNew: true });
					} else {
						messages = await getMessages({ client, dialog });
					}
					if (messages) {
						for (const m of messages) {
							result.push(m);
						}
					}
				} else {
					for (let i = 0; i < dialogs.length; i++) {
						const dialog = dialogs[i];
						messages = await getMessages({ client, dialog });
						if (messages) {
							for (const m of messages) {
								result.push(m);
							}
						}
					}
				}
				item.json.result = result;
			} catch (error) {
				if (this.continueOnFail()) {
					items.push({ json: this.getInputData(itemIndex)[0].json, error, pairedItem: itemIndex });
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
