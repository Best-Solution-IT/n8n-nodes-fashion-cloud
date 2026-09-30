import {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	JsonObject,
	NodeApiError,
	NodeOperationError,
} from 'n8n-workflow';

export const BASE_URL = 'https://api.fashion.cloud';

/** Maximum page sizes allowed by the API */
export const PAGE_SIZE = {
	brands: 200,
	products: 1000,
	prices: 200,
};

export type OperationHandler = (
	this: IExecuteFunctions,
	itemIndex: number,
) => Promise<INodeExecutionData[]>;

type FashionCloudContext = IExecuteFunctions | ILoadOptionsFunctions;

/**
 * Pagination styles used by the API:
 * - offset: `offset` + `limit` (brands)
 * - cursor: `afterId` + `limit`, next cursor returned as `nextId` (products, prices)
 */
export type PaginationMode = 'offset' | 'cursor';

/**
 * Fashion Cloud returns errors as `{ type, message, errors? }`. Tries to find that
 * body on the different error shapes n8n / axios produce (for binary requests the
 * body arrives as a Buffer).
 */
function extractErrorBody(error: unknown): IDataObject | undefined {
	const err = error as IDataObject & {
		response?: IDataObject;
		cause?: IDataObject & { response?: IDataObject };
		context?: IDataObject;
	};
	const candidates = [
		err?.response?.data,
		err?.response?.body,
		err?.cause?.response?.data,
		err?.cause?.response?.body,
		err?.context?.data,
	];

	for (const candidate of candidates) {
		let body: unknown = candidate;
		if (Buffer.isBuffer(body)) {
			try {
				body = JSON.parse(body.toString('utf8'));
			} catch {
				continue;
			}
		}
		if (body && typeof body === 'object' && !Array.isArray(body)) {
			const data = body as IDataObject;
			if (data.type !== undefined || data.message !== undefined) return data;
		}
	}
	return undefined;
}

function describeErrorBody(body: IDataObject): string {
	const parts: string[] = [];
	const head = [body.type, body.message].filter(Boolean).join(': ');
	if (head) parts.push(head);

	if (Array.isArray(body.errors)) {
		for (const entry of body.errors as IDataObject[]) {
			// ValidationError: { field, type, message }
			// OrderingProcessError: { type, message, gtin, orderedQuantity, availableQuantity }
			const details = Object.entries(entry)
				.filter(([key]) => key !== 'message')
				.map(([key, value]) => `${key}=${value}`)
				.join(', ');
			parts.push(`- ${entry.message ?? ''}${details ? ` (${details})` : ''}`);
		}
	}
	return parts.join('\n');
}

export async function fashionCloudApiRequest(
	this: FashionCloudContext,
	method: IHttpRequestMethods,
	endpoint: string,
	qs: IDataObject = {},
	body?: IDataObject,
	options: Partial<IHttpRequestOptions> = {},
): Promise<unknown> {
	const requestOptions: IHttpRequestOptions = {
		method,
		baseURL: BASE_URL,
		url: endpoint,
		qs,
		json: true,
		...options,
	};
	if (body !== undefined) requestOptions.body = body;

	try {
		return await this.helpers.httpRequestWithAuthentication.call(
			this,
			'fashionCloudApi',
			requestOptions,
		);
	} catch (error) {
		const apiError = new NodeApiError(this.getNode(), error as JsonObject);
		const errorBody = extractErrorBody(error);
		if (errorBody) {
			apiError.description = describeErrorBody(errorBody);
			apiError.context.data = errorBody;
		}
		throw apiError;
	}
}

/**
 * Fetches pages until the API has no more data or `maxItems` items were collected.
 * Returns the unwrapped entries of the `data` array of each page.
 */
export async function fashionCloudApiRequestAllItems(
	this: FashionCloudContext,
	endpoint: string,
	qs: IDataObject,
	mode: PaginationMode,
	pageSize: number,
	maxItems = Infinity,
): Promise<IDataObject[]> {
	const results: IDataObject[] = [];
	const query: IDataObject = { ...qs };
	let offset = typeof query.offset === 'number' ? query.offset : 0;

	while (results.length < maxItems) {
		query.limit = Math.min(pageSize, maxItems - results.length);
		if (mode === 'offset') query.offset = offset;

		const response = (await fashionCloudApiRequest.call(
			this,
			'GET',
			endpoint,
			query,
		)) as IDataObject;
		const data = (Array.isArray(response?.data) ? response.data : []) as IDataObject[];
		results.push(...data);

		if (data.length === 0 || data.length < (query.limit as number)) break;

		if (mode === 'offset') {
			offset += data.length;
			const total = response.totalElements;
			if (typeof total === 'number' && offset >= total) break;
		} else {
			const nextId = response.nextId;
			if (!nextId || nextId === query.afterId) break;
			query.afterId = nextId;
		}
	}

	return results.slice(0, maxItems);
}

/** Offset (ms) of `timeZone` from UTC at the given instant. */
function timezoneOffsetMs(instant: number, timeZone: string): number {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		hourCycle: 'h23',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	}).formatToParts(new Date(instant));
	const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
	const wallClockAsUtc = Date.UTC(
		get('year'),
		get('month') - 1,
		get('day'),
		get('hour'),
		get('minute'),
		get('second'),
	);
	return wallClockAsUtc - Math.floor(instant / 1000) * 1000;
}

/**
 * Converts an n8n date/time value into a full ISO 8601 UTC string. Values without
 * a timezone designator (as produced by the date picker) are interpreted in `timeZone`.
 */
export function toIsoDate(value: unknown, timeZone = 'UTC'): string | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	let text = String(value).trim();
	if (/^\d{4}-\d{2}-\d{2}$/.test(text)) text += 'T00:00:00';

	const hasTimezone = /(Z|[+-]\d{2}:?\d{2})$/i.test(text);
	if (hasTimezone) {
		const date = new Date(text);
		return isNaN(date.getTime()) ? undefined : date.toISOString();
	}

	const wallClockAsUtc = Date.parse(`${text}Z`);
	if (isNaN(wallClockAsUtc)) return undefined;
	const instant = wallClockAsUtc - timezoneOffsetMs(wallClockAsUtc, timeZone);
	return new Date(instant).toISOString();
}

/** Reads an "Updated Since" style parameter and converts it to ISO 8601, or throws. */
export function getIsoDateParameter(
	this: IExecuteFunctions,
	value: unknown,
	label: string,
	itemIndex: number,
): string | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	const iso = toIsoDate(value, this.getTimezone());
	if (!iso) {
		throw new NodeOperationError(this.getNode(), `Invalid "${label}" date: ${value}`, {
			itemIndex,
		});
	}
	return iso;
}

/** Reads a JSON parameter that may arrive as a string or as an already parsed value. */
export function parseJsonParameter(
	this: IExecuteFunctions,
	value: unknown,
	label: string,
	itemIndex: number,
): unknown {
	if (typeof value !== 'string') return value;
	try {
		return JSON.parse(value);
	} catch {
		throw new NodeOperationError(this.getNode(), `"${label}" is not valid JSON`, { itemIndex });
	}
}

export function toExecutionData(
	this: IExecuteFunctions,
	entries: IDataObject | IDataObject[],
	itemIndex: number,
): INodeExecutionData[] {
	return this.helpers.constructExecutionMetaData(this.helpers.returnJsonArray(entries), {
		itemData: { item: itemIndex },
	});
}
