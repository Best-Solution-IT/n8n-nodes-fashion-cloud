import type { OperationHandler } from '../GenericFunctions';
import * as brand from './brand';
import * as order from './order';
import * as price from './price';
import * as product from './product';

/** Maps resource → operation → implementation */
export const handlers: Record<string, Record<string, OperationHandler>> = {
	brand: { getAll: brand.getAll },
	order: { create: order.create },
	price: { getAll: price.getAll },
	product: { getAll: product.getAll, getImage: product.getImage, getStock: product.getStock },
};
