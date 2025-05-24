import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionType, NodeOperationError } from 'n8n-workflow';
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions/index.js';

export class TelegramUser implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Telegram User',
		name: 'telegramUser',
		icon: 'file:telegram.svg',
		group: ['transform'],
		version: 2,
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
		properties: [],
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

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				item = items[itemIndex];

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

				const result = [];
				for (let i = 0; i < dialogs.length; i++) {
					const dialog = dialogs[i];
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
								rawMessages[rawMessages.length - 1].date <
								Math.trunc((Date.now() - 1000 * 60 * 60) / 1000)
							) {
								getMore = false;
							}
							messages = rawMessages
								.filter((m) => m.date >= Math.trunc((Date.now() - 1000 * 60 * 60) / 1000))
								.map((m) => ({
									id: m.id,
									text: m.message,
									date: m.date,
									source: dialog.title,
									sourceType: dialog.isChannel
										? 'channel'
										: dialog.isGroup
											? 'group'
											: dialog.isUser
												? 'user'
												: 'unknown',
								}));
						}
					}
					// result.push({
					// 	id: dialog.id,
					// 	title: dialog.title,
					// 	name: dialog.name,
					// 	username: dialog.isChannel ? (dialog.entity as any)?.username : null,
					// 	type: dialog.isChannel
					// 		? 'channel'
					// 		: dialog.isGroup
					// 			? 'group'
					// 			: dialog.isUser
					// 				? 'user'
					// 				: 'unknown',
					// 	unreadCount: dialog.unreadCount,
					// 	unreadMentionsCount: dialog.unreadMentionsCount,
					// 	messages,
					// });
					if (messages) {
						for (const m of messages) {
							result.push(m);
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
