import type { IDataObject, IExecuteFunctions, INodeExecutionData } from 'n8n-workflow';

import { fashionCloudApiRequestAllItems, PAGE_SIZE, toExecutionData } from '../GenericFunctions';

export async function getAll(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
	const returnAll = this.getNodeParameter('returnAll', i) as boolean;
	const limit = returnAll ? Infinity : (this.getNodeParameter('limit', i) as number);
	const filters = this.getNodeParameter('filters', i, {}) as IDataObject;

	const qs: IDataObject = {};
	if (filters.gln) qs.gln = filters.gln;

	const brands = await fashionCloudApiRequestAllItems.call(
		this,
		'/v2/brands',
		qs,
		'offset',
		PAGE_SIZE.brands,
		limit,
	);
	return toExecutionData.call(this, brands, i);
}
