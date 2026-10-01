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
	const productFilter = this.getNodeParameter('productFilter', i) as string;
	const options = this.getNodeParameter('options', i, {}) as IDataObject;

	const filter =
		productFilter === 'gtin' || productFilter === 'articleNumber' ? productFilter : 'brand';
	const label = { brand: 'Brand', gtin: 'GTIN', articleNumber: 'Article Number' }[filter];
	// e.g. an expression that resolves to nothing
	const value = String(this.getNodeParameter(filter, i, '') ?? '').trim();
	if (!value) {
		throw new NodeOperationError(this.getNode(), `${label} must not be empty`, { itemIndex: i });
	}

	const qs: IDataObject = { [filter]: value };
	// A GTIN identifies a product across brands, an article number only within a brand
	const brand = String(options.brand ?? '').trim();
	if (filter === 'articleNumber' && brand) qs.brand = brand;

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
	const imageId = String(this.getNodeParameter('imageId', i) ?? '').trim();
	const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;
	const imageOptions = this.getNodeParameter('imageOptions', i, {}) as IDataObject;

	if (!imageId) {
		throw new NodeOperationError(this.getNode(), 'Image ID must not be empty', { itemIndex: i });
	}
	// The ID becomes a URL path segment and part of the file name. "." and ".." would be
	// resolved as relative segments and reach a different endpoint.
	if (!/^[\w.-]+$/.test(imageId) || /^\.+$/.test(imageId)) {
		throw new NodeOperationError(this.getNode(), `Invalid Image ID "${imageId}"`, {
			itemIndex: i,
			description:
				'An image ID may only contain letters, digits, "-", "_" and ".". Use the "_id" of an entry in a product\'s "media.images".',
		});
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
	const gtin = String(this.getNodeParameter('stockGtin', i) ?? '').trim();
	if (!gtin) {
		throw new NodeOperationError(this.getNode(), 'GTIN must not be empty', { itemIndex: i });
	}
	// The GTIN becomes a URL path segment, so nothing but digits may reach the URL
	if (!/^\d+$/.test(gtin)) {
		throw new NodeOperationError(this.getNode(), `Invalid GTIN "${gtin}"`, {
			itemIndex: i,
			description: 'A GTIN consists of digits only.',
		});
	}

	const stock = (await fashionCloudApiRequest.call(
		this,
		'GET',
		`/v2/products/${encodeURIComponent(gtin)}/stock`,
	)) as IDataObject;

	// The response does not contain the GTIN, add it so results can be matched
	return toExecutionData.call(this, { gtin, ...stock }, i);
}
