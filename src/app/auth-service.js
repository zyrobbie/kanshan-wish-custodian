import { createClient } from '@supabase/supabase-js';

export const authMessages = Object.freeze({ authentication_required: '身份会话暂不可用，请稍后重试。', otp_invalid: '验证码无效或已过期，请重新获取。', otp_rate_limited: '验证码请求过于频繁，请稍后再试。', otp_failed: '验证码验证失败，请重新获取。', request_failed: '身份服务请求失败，请稍后重试。' });
export class AuthServiceError extends Error { constructor(code) { super(authMessages[code] ?? authMessages.request_failed); this.code = code; } }
const friendly = (message) => /rate|limit/i.test(message ?? '') ? 'otp_rate_limited' : /expired|invalid|token/i.test(message ?? '') ? 'otp_invalid' : 'request_failed';

export class AuthService {
  constructor({ url, publishableKey, client } = {}) { this.configured = Boolean(url && publishableKey && !url.includes('your-project-ref')); this.client = client ?? (this.configured ? createClient(url, publishableKey) : null); this.initializing = null; }
  async ensureSession() {
    if (!this.configured || !this.client) throw new AuthServiceError('authentication_required');
    if (!this.initializing) this.initializing = (async () => { const { data, error } = await this.client.auth.getUser(); if (error) throw new AuthServiceError('authentication_required'); if (data.user) return data.user; const result = await this.client.auth.signInAnonymously(); if (result.error || !result.data?.user) throw new AuthServiceError('authentication_required'); return result.data.user; })().finally(() => { this.initializing = null; });
    return this.initializing;
  }
  async bindEmail(email) { const before = await this.ensureSession(); if (!before.is_anonymous) throw new AuthServiceError('request_failed'); const { error } = await this.client.auth.updateUser({ email }); if (error) throw new AuthServiceError(friendly(error.message)); return { ownerIdBefore: before.id }; }
  async verifyBinding(email, token, ownerIdBefore) { const { error } = await this.client.auth.verifyOtp({ email, token, type: 'email_change' }); if (error) throw new AuthServiceError(friendly(error.message)); const { data } = await this.client.auth.getUser(); if (!data.user || data.user.id !== ownerIdBefore) throw new AuthServiceError('request_failed'); return data.user; }
  async requestExistingLogin(email) { const { data: session } = await this.client.auth.getSession(); const sourceToken = session.session?.user?.is_anonymous ? session.session.access_token : null; const { error } = await this.client.auth.signInWithOtp({ email, options: { shouldCreateUser: false } }); if (error) throw new AuthServiceError(friendly(error.message)); return { sourceToken }; }
  async verifyExistingLogin(email, token) { const { data, error } = await this.client.auth.verifyOtp({ email, token, type: 'email' }); if (error || !data.user) throw new AuthServiceError(friendly(error?.message)); return data.user; }
  async signOut() { if (this.client) await this.client.auth.signOut(); }
}
