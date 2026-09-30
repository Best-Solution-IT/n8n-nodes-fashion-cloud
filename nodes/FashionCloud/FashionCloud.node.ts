import {
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	JsonObject,
	NodeApiError,
	NodeConnectionTypes,
	NodeOperationError,
} from 'n8n-workflow';

import { handlers } from './actions';
import { brandFields, brandOperations } from './descriptions/BrandDescription';
import { orderFields, orderOperations } from './descriptions/OrderDescription';
import { priceFields, priceOperations } from './descriptions/PriceDescription';
import { productFields, productOperations } from './descriptions/ProductDescription';
import { fashionCloudApiRequestAllItems, PAGE_SIZE } from './GenericFunctions';

// Value n8n uses for the "Custom API Call" option it adds to every resource
const CUSTOM_API_CALL = '__CUSTOM_API_CALL__';

export class FashionCloud implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Fashion Cloud',
		name: 'fashionCloud',
		icon: {
			light: 'file:../../icons/fashionCloud.svg',
			dark: 'file:../../icons/fashionCloud.dark.svg',
		},
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Interact with the Fashion Cloud API',
		defaults: {
			name: 'Fashion Cloud',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'fashionCloudApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Brand', value: 'brand' },
					{ name: 'Order', value: 'order' },
					{ name: 'Price', value: 'price' },
					{ name: 'Product', value: 'product' },
				],
				default: 'brand',
			},
			...brandOperations,
			...brandFields,
			...orderOperations,
			...orderFields,
			...priceOperations,
			...priceFields,
			...productOperations,
			...productFields,
		],
	};

	methods = {
		loadOptions: {
			async getBrands(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const brands = await fashionCloudApiRequestAllItems.call(
					this,
					'/v2/brands',
					{},
					'offset',
					PAGE_SIZE.brands,
				);
				return brands
					.map((entry) => ({ name: String(entry.name ?? entry._id), value: String(entry._id) }))
					.sort((a, b) => a.name.localeCompare(b.name));
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				// n8n offers "Custom API Call" but leaves it to the HTTP Request node
				if (resource === CUSTOM_API_CALL) {
					throw new NodeOperationError(
						this.getNode(),
						'Custom API calls are made with the HTTP Request node',
						{
							itemIndex: i,
							description:
								'Add an HTTP Request node, set Authentication to "Predefined Credential Type" and choose "Fashion Cloud API". Enter the full URL, e.g. https://api.fashion.cloud/v2/brands; the token is added automatically.',
						},
					);
				}
				const operation = this.getNodeParameter('operation', i) as string;

				const handler = handlers[resource]?.[operation];
				if (!handler) {
					throw new NodeOperationError(
						this.getNode(),
						`Unsupported resource/operation: ${resource}/${operation}`,
						{ itemIndex: i },
					);
				}
				returnData.push(...(await handler.call(this, i)));
			} catch (error) {
				if (this.continueOnFail()) {
					const err = error as { message?: string; description?: string | null };
					returnData.push({
						json: {
							error: err.message ?? String(error),
							...(err.description ? { description: err.description } : {}),
						},
						pairedItem: { item: i },
					});
					continue;
				}
				// Both constructors return the given instance unchanged if it already has their type
				if (error instanceof NodeApiError) {
					throw new NodeApiError(this.getNode(), error as unknown as JsonObject, { itemIndex: i });
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
