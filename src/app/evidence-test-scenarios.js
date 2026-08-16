import { ZhihuEvidenceError } from './zhihu-service.js';

export const evidenceTestNames = Object.freeze(['both', 'expert-only', 'experience-only', 'empty', 'expert-error', 'experience-error', 'timeout', 'permission', 'invalid', 'html']);

export function evidenceTestName(search) {
  const value = new URLSearchParams(search).get('evidenceTest');
  return evidenceTestNames.includes(value) ? value : null;
}

const expert = Object.freeze({
  layer: 'expert', id: 'local-expert', title: '参数与使用场景需要一起比较', authorName: '开发测试作者', authorBadgeText: '开发测试认证', contentType: '回答',
  summary: '从参数、清洁难度和已有器具重叠程度出发，再判断是否适合自己的使用场景。', url: 'https://www.zhihu.com/question/123456/answer/123456', voteUpCount: 12, authorityLevel: '2', editTime: 1,
});
const experience = Object.freeze({
  layer: 'experience', id: 'local-experience', title: '长期使用后才发现收纳和清洗成本', authorName: '开发测试用户', authorBadgeText: null, contentType: '文章',
  summary: '我使用半年后发现，若每次取用和清洗都麻烦，最终很容易闲置积灰。', url: 'https://zhuanlan.zhihu.com/p/123456', voteUpCount: 8, authorityLevel: null, editTime: 2,
});

function payload(expertLayer, experienceLayer) {
  return { coreProductName: '开发测试商品', layers: { expert: expertLayer, experience: experienceLayer }, fetchedAt: '2026-08-16T00:00:00.000Z' };
}

export class EvidenceTestService {
  constructor(name) { this.name = name; this.configured = true; }

  async load() {
    switch (this.name) {
      case 'both': return payload({ status: 'ready', items: [expert] }, { status: 'ready', items: [experience] });
      case 'expert-only': return payload({ status: 'ready', items: [expert] }, { status: 'empty', items: [] });
      case 'experience-only': return payload({ status: 'empty', items: [] }, { status: 'ready', items: [experience] });
      case 'empty': return payload({ status: 'empty', items: [] }, { status: 'empty', items: [] });
      case 'expert-error': return payload({ status: 'error', items: [] }, { status: 'ready', items: [experience] });
      case 'experience-error': return payload({ status: 'ready', items: [expert] }, { status: 'error', items: [] });
      case 'timeout': throw new ZhihuEvidenceError('provider_timeout');
      case 'permission': throw new ZhihuEvidenceError('provider_auth_failed');
      case 'invalid': throw new ZhihuEvidenceError('invalid_response');
      case 'html': return payload(
        { status: 'ready', items: [{ ...expert, title: '<em>参数</em><script>throw new Error()</script>', authorName: '<img src=x onerror=alert(1)>', summary: '摘要 <em>高亮</em> <script>alert(1)</script>' }] },
        { status: 'ready', items: [{ ...experience, title: '体验 <b>内容</b>', summary: '长期 <em>使用</em> 体验' }] },
      );
      default: throw new ZhihuEvidenceError('request_failed');
    }
  }
}
