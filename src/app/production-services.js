import { createClient } from '@supabase/supabase-js';
import { ProductSearchService } from './products-service.js';
import { ZhihuEvidenceService } from './zhihu-service.js';
import { AuthService } from './auth-service.js';
import { WishesService } from './wishes-service.js';

// The production application has one browser identity context.  Keep the
// client creation here so product search, evidence, and custody all share the
// same GoTrue storage key and anonymous session.
export function createProductionServices({ url, publishableKey, createSupabaseClient = createClient } = {}) {
  const configured = Boolean(url && publishableKey && !url.includes('your-project-ref'));
  const client = configured ? createSupabaseClient(url, publishableKey) : null;
  const options = { url, publishableKey, client };
  const authService = new AuthService(options);
  return {
    client,
    productService: new ProductSearchService(options),
    evidenceService: new ZhihuEvidenceService(options),
    authService,
    wishesService: new WishesService({ auth: authService }),
  };
}
