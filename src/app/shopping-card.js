import { savedPromotionHref } from './wish-domain.js';

/**
 * Builds the presentation model solely from a stored wish snapshot. There is
 * deliberately no search, link conversion, or URL fallback in this boundary.
 */
export function shoppingCardSnapshot(wish) {
  const product = wish?.product && typeof wish.product === 'object' ? wish.product : {};
  return Object.freeze({
    itemId: typeof product.itemId === 'string' ? product.itemId : '',
    title: typeof product.title === 'string' ? product.title : '',
    imageUrl: typeof product.imageUrl === 'string' ? product.imageUrl : null,
    sellingPrice: Number.isFinite(product.sellingPrice) ? product.sellingPrice : null,
    estimatedPrice: Number.isFinite(product.estimatedPrice) ? product.estimatedPrice : null,
    promotionHref: savedPromotionHref(product.promotionUrl),
  });
}
