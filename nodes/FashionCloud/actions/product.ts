import {
	IBinaryKeyData,
	IDataObject,
	IExecuteFunctions,
	IN8nHttpFullResponse,
	INodeExecutionData,
	NodeOperationError,
} from 'n8n-workflow';

import {
	fashionCloudApiRequest,
	fashionCloudApiRequestAllItems,
	getIsoDateParameter,
	PAGE_SIZE,
	toExecutionData,
} from '../GenericFunctions';

export async function getAll(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
	const returnAll = this.getNodeParameter('returnAll', i) as boolean;
	const limit = returnAll ? Infinity : (this.getNodeParameter('limit', i) as number);
	const brand = this.getNodeParameter('brand', i, '') as string;
	const productFilter = this.getNodeParameter('productFilter', i) as string;
	const options = this.getNodeParameter('options', i, {}) as IDataObject;

	const qs: IDataObject = {};
	if (brand) qs.brand = brand;
	if (productFilter === 'gtin') {
		qs.gtin = this.getNodeParameter('gtin', i) as string;
	} else if (productFilter === 'articleNumber') {
		qs.articleNumber = this.getNodeParameter('articleNumber', i) as string;
	}

	if (!qs.brand && !qs.gtin && !qs.articleNumber) {
		throw new NodeOperationError(
			this.getNode(),
			'A brand, GTIN or article number is required to list products',
			{ itemIndex: i },
		);
	}

	for (const key of [
		'afterId',
		'lang',
		'season',
		'seasonYear',
		'includePreliminary',
		'includeProductsWithoutImages',
	]) {
		const value = options[key];
		if (value !== undefined && value !== '' && value !== null) qs[key] = value;
	}
	const updatedSince = getIsoDateParameter.call(this, options.updatedSince, 'Updated Since', i);
	if (updatedSince) qs.updatedSince = updatedSince;

	const products = await fashionCloudApiRequestAllItems.call(
		this,
		'/v2/products',
		qs,
		'cursor',
		PAGE_SIZE.products,
		limit,
	);
	return toExecutionData.call(this, products, i);
}

export async function getImage(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
	const imageId = (this.getNodeParameter('imageId', i) as string).trim();
	const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;
	const imageOptions = this.getNodeParameter('imageOptions', i, {}) as IDataObject;

	if (!imageId) {
		throw new NodeOperationError(this.getNode(), 'Image ID must not be empty', { itemIndex: i });
	}

	const qs: IDataObject = {};
	if (imageOptions.px) qs.px = imageOptions.px;
	if (imageOptions.minAcceptableSize) {
		if (!imageOptions.px) {
			throw new NodeOperationError(
				this.getNode(),
				'"Minimum Acceptable Size" only works together with "Size"',
				{ itemIndex: i },
			);
		}
		qs.minAcceptableSize = imageOptions.minAcceptableSize;
	}
	if (imageOptions.watermark !== undefined) qs.watermark = imageOptions.watermark;

	const response = (await fashionCloudApiRequest.call(
		this,
		'GET',
		`/v2/products/media/images/${encodeURIComponent(imageId)}`,
		qs,
		undefined,
		{ json: false, encoding: 'arraybuffer', returnFullResponse: true },
	)) as IN8nHttpFullResponse;

	const contentType = String(response.headers?.['content-type'] ?? 'image/jpeg');
	const mimeType = contentType.split(';')[0].trim();
	const fileName = `${imageId}${qs.px ? `_${qs.px}` : ''}.jpg`;
	const binary: IBinaryKeyData = {
		[binaryPropertyName]: await this.helpers.prepareBinaryData(
			Buffer.from(response.body as ArrayBuffer),
			fileName,
			mimeType,
		),
	};

	return [{ json: { imageId, ...qs }, binary, pairedItem: { item: i } }];
}

export async function getStock(this: IExecuteFunctions, i: number): Promise<INodeExecutionData[]> {
	const gtin = String(this.getNodeParameter('stockGtin', i)).trim();
	if (!gtin) {
		throw new NodeOperationError(this.getNode(), 'GTIN must not be empty', { itemIndex: i });
	}

	const stock = (await fashionCloudApiRequest.call(
		this,
		'GET',
		`/v2/products/${encodeURIComponent(gtin)}/stock`,
	)) as IDataObject;

	// The response does not contain the GTIN, add it so results can be matched
	return toExecutionData.call(this, { gtin, ...stock }, i);
}
