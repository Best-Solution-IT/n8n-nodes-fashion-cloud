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
