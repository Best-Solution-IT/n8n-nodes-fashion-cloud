import {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	NodeOperationError,
} from 'n8n-workflow';

import {
	fashionCloudApiRequestAllItems,
	getIsoDateParameter,
	PAGE_SIZE,
	toExecutionData,
} from '../GenericFunctions';

export async function getAll(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
	const brand = this.getNodeParameter('brand', i) as string;
	const returnAll = this.getNodeParameter('returnAll', i) as boolean;
	const limit = returnAll ? Infinity : (this.getNodeParameter('limit', i) as number);
	const options = this.getNodeParameter('priceOptions', i, {}) as IDataObject;

	if (!brand) {
		throw new NodeOperationError(this.getNode(), 'A brand is required to list prices', {
			itemIndex: i,
		});
	}

	const qs: IDataObject = { brand };
	if (options.gtins) {
		qs.gtins = String(options.gtins)
			.split(',')
			.map((gtin) => gtin.trim())
			.filter(Boolean)
			.join(',');
	}
	if (options.afterId) qs.afterId = options.afterId;
	const updatedSince = getIsoDateParameter.call(this, options.updatedSince, 'Updated Since', i);
	if (updatedSince) qs.updatedSince = updatedSince;

	// Note the trailing slash, as documented in the API spec
	const prices = await fashionCloudApiRequestAllItems.call(
		this,
		'/v2/products/prices/',
		qs,
		'cursor',
		PAGE_SIZE.prices,
		limit,
	);
	return toExecutionData.call(this, prices, i);
}
