const yuan = new Intl.NumberFormat('zh-CN', { style: 'currency', currency: 'CNY' });

export function priceSnapshot(product) {
  const sellingPrice = Number(product.sellingPrice);
  const estimatedPrice = Number(product.estimatedPrice);
  if (!Number.isFinite(sellingPrice) || !Number.isFinite(estimatedPrice)) throw new Error('Invalid product price');
  return { listPrice: Number(product.listPrice), sellingPrice, estimatedPrice };
}

export function displayPrice(value) {
  return yuan.format(Number(value));
}

export function plannedSpend(record) {
  return Number(record.priceSnapshot?.estimatedPrice ?? 0);
}

export function abandonedTotal(records) {
  return records.filter((record) => record.status === 'abandoned').reduce((sum, record) => sum + (record.abandonmentCounted ? plannedSpend(record) : 0), 0);
}
