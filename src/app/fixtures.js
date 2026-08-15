const safeImage = (label, color) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="100%" height="100%" fill="${color}"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="sans-serif" font-size="32" fill="#17324d">${label}</text></svg>`)}`;

export const fixtureProducts = [
  { itemId: 'fixture-01', title: '便携咖啡器具收纳套装', imageUrl: safeImage('开发测试图 01', '#dfe9e7'), listPrice: 219, sellingPrice: 159, estimatedPrice: 139, promotionUrl: 'https://example.com/fixture-promotion/01' },
  { itemId: 'fixture-02', title: '手冲咖啡滤杯与分享壶', imageUrl: safeImage('开发测试图 02', '#f3e6d7'), listPrice: 168, sellingPrice: 118, estimatedPrice: 99, promotionUrl: 'https://example.com/fixture-promotion/02' },
  { itemId: 'fixture-03', title: '随行保温咖啡杯 350ml', imageUrl: safeImage('开发测试图 03', '#e5e9f5'), listPrice: 139, sellingPrice: 95, estimatedPrice: 79, promotionUrl: 'https://example.com/fixture-promotion/03' },
  { itemId: 'fixture-04', title: '家用电子咖啡秤', imageUrl: safeImage('开发测试图 04', '#e8efd9'), listPrice: 188, sellingPrice: 128, estimatedPrice: 108, promotionUrl: 'https://example.com/fixture-promotion/04' },
  { itemId: 'fixture-05', title: '单人意式咖啡量杯', imageUrl: safeImage('开发测试图 05', '#f1e3e4'), listPrice: 69, sellingPrice: 49, estimatedPrice: 39, promotionUrl: 'https://example.com/fixture-promotion/05' },
];

export const fixtureEvidence = Object.freeze({
  both: {
    expert: [{ source: '开发测试·专业类样例', title: '先确认自己会在何种场景使用', summary: '先比较尺寸、清洁成本与现有器具的重叠程度；不要只因为促销补齐一套。' }],
    experience: [{ source: '开发测试·经验类样例', title: '长期使用前，先问存放与清洗', summary: '如果每次取用、清洗和收纳都嫌麻烦，购买后的使用频率通常会低于想象。' }],
  },
  partial: { expert: [{ source: '开发测试·专业类样例', title: '先验证实际需求', summary: '把使用频率和已有物品列出来，再决定是否需要新增。' }], experience: [] },
  none: { expert: [], experience: [] },
});

export function fixtureSearch(query, imageMode = 'normal') {
  return fixtureProducts.map((product, index) => ({ ...product, title: `${query} · ${product.title}`, imageUrl: imageMode === 'broken' && index === 0 ? '/fixture-missing-image.png' : product.imageUrl, promotionUrl: imageMode === 'missing-promotion' && index === 0 ? '' : product.promotionUrl }));
}
