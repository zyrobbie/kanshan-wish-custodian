import { ProductSearchError, normalizeClientQuery } from './products-service.js';

export const productTestNames = Object.freeze(['success', 'empty', 'timeout', 'permission', 'config', 'invalid', 'image']);

export function productTestName(search) {
  const value = new URLSearchParams(search).get('productTest');
  return productTestNames.includes(value) ? value : null;
}

const baseProduct = Object.freeze({
  provider: 'taobao',
  itemId: 'local-test-item',
  title: '开发测试商品',
  imageUrl: 'http://127.0.0.1:5177/product-test-image.svg',
  price: 39.8,
  finalPrice: 29.8,
  priceLabel: '预估到手价',
  promotionUrl: 'https://example.invalid/local-product-test',
  query: '开发测试商品',
  fetchedAt: '2026-08-16T00:00:00.000Z',
});

export class ProductTestService {
  constructor(name) { this.name = name; this.configured = true; }

  async search(query) {
    const normalized = normalizeClientQuery(query);
    if (!normalized) throw new ProductSearchError('invalid_query');
    switch (this.name) {
      case 'success': return { query: normalized, products: [{ ...baseProduct, query: normalized }] };
      case 'wish-success': return { query: normalized, products: [{ ...baseProduct, query: normalized, promotionUrl: 'https://s.click.taobao.com/local-wish-test' }] };
      case 'empty': return { query: normalized, products: [] };
      case 'timeout': throw new ProductSearchError('provider_timeout');
      case 'permission': throw new ProductSearchError('provider_permission_denied');
      case 'config': throw new ProductSearchError('service_not_configured');
      case 'invalid': throw new ProductSearchError('invalid_response');
      case 'image': return { query: normalized, products: [{ ...baseProduct, query: normalized, imageUrl: 'http://127.0.0.1:5177/missing-product-test-image.png', title: '图片加载失败测试商品' }] };
      default: throw new ProductSearchError('request_failed');
    }
  }
}
