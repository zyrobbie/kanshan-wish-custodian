import './style.css';
import { createClient } from '@supabase/supabase-js';

const config = {
  url: import.meta.env.VITE_SUPABASE_URL,
  publishableKey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
};
const logElement = document.querySelector('#diagnostic-log');
const configurationStatus = document.querySelector('#configuration-status');
const buttons = {
  anonymousLogin: document.querySelector('#anonymous-login'),
  writeWish: document.querySelector('#write-wish'),
  readWishes: document.querySelector('#read-wishes'),
  runRlsTest: document.querySelector('#run-rls-test'),
  runProductsSmoke: document.querySelector('#run-products-smoke'),
  runZhihuSmoke: document.querySelector('#run-zhihu-smoke'),
  runTaokeSmoke: document.querySelector('#run-taoke-smoke'),
  requestEmailLink: document.querySelector('#request-email-link'),
  verifyEmailLink: document.querySelector('#verify-email-link'),
  requestLoginOtp: document.querySelector('#request-login-otp'),
  verifyLoginOtp: document.querySelector('#verify-login-otp'),
};
const inputs = {
  linkEmail: document.querySelector('#link-email'),
  linkOtp: document.querySelector('#link-otp'),
  loginEmail: document.querySelector('#login-email'),
  loginOtp: document.querySelector('#login-otp'),
};
const log = (message) => { logElement.textContent = `${new Date().toISOString()} ${message}\n${logElement.textContent}`; };
const email = (input) => input.value.trim().toLowerCase();
const otp = (input) => input.value.trim();
const maskId = (value) => value ? `${value.slice(0, 8)}…${value.slice(-4)}` : '未返回';
let pendingAnonymousAccessToken = null;

if (!config.url || !config.publishableKey || config.url.includes('your-project-ref')) {
  configurationStatus.textContent = '未配置 Supabase 公开 URL / publishable key；远程链路尚未启动。';
  buttons.anonymousLogin.disabled = true;
} else {
  const supabase = createClient(config.url, config.publishableKey);
  configurationStatus.textContent = '公开配置已加载；可开始匿名身份诊断。';

  buttons.anonymousLogin.addEventListener('click', async () => {
    const { data: existing } = await supabase.auth.getUser();
    const result = existing.user ? { data: { user: existing.user }, error: null } : await supabase.auth.signInAnonymously();
    if (result.error) return log(`匿名会话失败：${result.error.message}`);
    log(`会话已就绪：uid=${maskId(result.data.user.id)}，匿名=${result.data.user.is_anonymous}`);
    buttons.writeWish.disabled = false;
    buttons.readWishes.disabled = false;
    buttons.runProductsSmoke.disabled = false;
    buttons.runZhihuSmoke.disabled = false;
    buttons.runTaokeSmoke.disabled = false;
    buttons.requestEmailLink.disabled = !result.data.user.is_anonymous;
    buttons.verifyEmailLink.disabled = !result.data.user.is_anonymous;
  });

  buttons.writeWish.addEventListener('click', async () => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return log('没有当前会话，不能写入。');
    const { data, error } = await supabase.from('wishes').insert({
      product: { title: '阶段 1 测试愿望', itemId: 'phase1-test' },
      evidence: { expert: [], experience: [] },
      custody_hours: 24,
      demo_duration_seconds: 24,
      expires_at: new Date(Date.now() + 24_000).toISOString(),
      status: 'sealed',
    }).select('id, owner_id, status, created_at').single();
    if (error) return log(`测试愿望写入失败：${error.message}`);
    log(`测试愿望已写入：wish=${maskId(data.id)}，owner=${maskId(data.owner_id)}，状态=${data.status}`);
  });

  buttons.readWishes.addEventListener('click', async () => {
    const { data, error } = await supabase.from('wishes').select('id, owner_id, status, created_at').order('created_at', { ascending: false });
    if (error) return log(`读取失败：${error.message}`);
    log(`读取成功：${data.length} 条愿望；仅返回当前 uid 的记录由 RLS 保证。`);
  });

  buttons.runRlsTest.addEventListener('click', async () => {
    buttons.runRlsTest.disabled = true;
    try {
      const isolatedClient = () => createClient(config.url, config.publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const userA = isolatedClient();
      const userB = isolatedClient();
      const [{ data: aSession, error: aError }, { data: bSession, error: bError }] = await Promise.all([
        userA.auth.signInAnonymously(), userB.auth.signInAnonymously(),
      ]);
      if (aError || bError) throw new Error(aError?.message ?? bError?.message ?? '无法创建测试会话');
      const { data: created, error: insertError } = await userA.from('wishes').insert({
        product: { title: '阶段 1 RLS 临时记录', itemId: 'phase1-rls-test' },
        evidence: { expert: [], experience: [] },
        custody_hours: 24,
        demo_duration_seconds: 24,
        expires_at: new Date(Date.now() + 24_000).toISOString(),
        status: 'sealed',
      }).select('id, status').single();
      if (insertError || !created) throw new Error(insertError?.message ?? '无法创建临时记录');
      const [{ data: selectedByB, error: selectError }, { data: updatedByB, error: updateError }, { data: deletedByB, error: deleteError }] = await Promise.all([
        userB.from('wishes').select('id').eq('id', created.id),
        userB.from('wishes').update({ status: 'abandoned' }).eq('id', created.id).select('id, status'),
        userB.from('wishes').delete().eq('id', created.id).select('id'),
      ]);
      if (selectError || updateError || deleteError) throw new Error(selectError?.message ?? updateError?.message ?? deleteError?.message ?? 'RLS 请求失败');
      const { data: stillOwnedByA, error: ownerReadError } = await userA.from('wishes').select('id, status').eq('id', created.id).single();
      if (ownerReadError) throw new Error(ownerReadError.message);
      const { error: cleanupError } = await userA.from('wishes').delete().eq('id', created.id);
      if (cleanupError) throw new Error(`临时记录清理失败：${cleanupError.message}`);
      const denied = selectedByB.length === 0 && updatedByB.length === 0 && deletedByB.length === 0 && stillOwnedByA.status === 'sealed';
      log(`两用户 RLS 测试：A=${maskId(aSession.user.id)}，B=${maskId(bSession.user.id)}；B 读取/修改/删除均返回 0；A 记录未变且已清理；越权拒绝=${denied}。`);
    } catch (error) {
      log(`两用户 RLS 测试失败：${error instanceof Error ? error.message : '未知错误'}`);
    } finally {
      buttons.runRlsTest.disabled = false;
    }
  });

  buttons.runProductsSmoke.addEventListener('click', async () => {
    buttons.runProductsSmoke.disabled = true;
    try {
      const { data, error } = await supabase.functions.invoke('products-search', { body: { query: '手机壳' } });
      if (error || !data?.ok) throw new Error(data?.error ?? error?.message ?? '未知错误');
      log(`淘宝搜索真实冒烟成功：查询已完成，返回 ${Array.isArray(data.products) ? data.products.length : 0} 条规范化结果；响应未记录商品链接或凭据。`);
    } catch (error) {
      log(`淘宝搜索真实冒烟失败：${error instanceof Error ? error.message : '未知错误'}。请检查函数日志和联盟应用权限后再定位，不自动重试。`);
    } finally {
      buttons.runProductsSmoke.disabled = false;
    }
  });

  buttons.runZhihuSmoke.addEventListener('click', async () => {
    buttons.runZhihuSmoke.disabled = true;
    try {
      const { data, error } = await supabase.functions.invoke('zhihu-search', { body: { query: '手机壳' } });
      if (error || !data?.ok || !Array.isArray(data.items)) throw new Error(data?.error ?? error?.message ?? '未知错误');
      log(`知乎搜索真实冒烟成功：查询已完成，返回 ${data.items.length} 条规范化结果；响应未记录内容链接或凭据。`);
    } catch (error) {
      log(`知乎搜索真实冒烟失败：${error instanceof Error ? error.message : '未知错误'}。请检查函数日志和知乎开放平台权限后再定位，不自动重试。`);
    } finally {
      buttons.runZhihuSmoke.disabled = false;
    }
  });

  buttons.runTaokeSmoke.addEventListener('click', async () => {
    buttons.runTaokeSmoke.disabled = true;
    try {
      const { data, error } = await supabase.functions.invoke('taoke-convert', { body: { material: 'https://e.tb.cn/h.8hPj17R34RisFIt?tk=35SkT0jRWwM' } });
      if (error || !data?.ok || data.linkGenerated !== true) throw new Error(data?.error ?? error?.message ?? '未知错误');
      log('淘客转链真实冒烟成功：已生成 CPS 短链；响应与日志均未显示推广链接或凭据。');
    } catch (error) {
      log(`淘客转链真实冒烟失败：${error instanceof Error ? error.message : '未知错误'}。请检查函数日志和转链 Skill 授权后再定位，不自动重试。`);
    } finally {
      buttons.runTaokeSmoke.disabled = false;
    }
  });

  buttons.requestEmailLink.addEventListener('click', async () => {
    const targetEmail = email(inputs.linkEmail);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user?.is_anonymous) return log('当前不是匿名会话，不能执行匿名邮箱绑定。');
    if (!targetEmail) return log('请输入要绑定的新邮箱。');
    const sourceUid = userData.user.id;
    const { error } = await supabase.auth.updateUser({ email: targetEmail });
    if (error) return log(`绑定验证码发送失败：${error.message}`);
    log(`绑定验证码已请求：uid=${maskId(sourceUid)}。请在新邮箱中查看 Email Change 验证码；不要切换浏览器会话。`);
  });

  buttons.verifyEmailLink.addEventListener('click', async () => {
    const targetEmail = email(inputs.linkEmail);
    const token = otp(inputs.linkOtp);
    const { data: before } = await supabase.auth.getUser();
    if (!before.user?.is_anonymous) return log('当前不是待绑定的匿名会话。');
    if (!targetEmail || !token) return log('请输入新邮箱和邮件中的验证码。');
    const sourceUid = before.user.id;
    const { error } = await supabase.auth.verifyOtp({ email: targetEmail, token, type: 'email_change' });
    if (error) return log(`绑定验证码验证失败：${error.message}`);
    const { data: after, error: afterError } = await supabase.auth.getUser();
    if (afterError || !after.user) return log(`验证码已接受，但无法读取更新后的用户：${afterError?.message ?? '未知错误'}`);
    const uidUnchanged = sourceUid === after.user.id;
    log(`邮箱绑定完成：uid 未变化=${uidUnchanged}，匿名=${after.user.is_anonymous}。现在可读取愿望，验证原记录仍在。`);
    buttons.requestEmailLink.disabled = true;
    buttons.verifyEmailLink.disabled = true;
  });

  buttons.requestLoginOtp.addEventListener('click', async () => {
    const targetEmail = email(inputs.loginEmail);
    if (!targetEmail) return log('请输入已经绑定过的邮箱。');
    const { data: currentSession } = await supabase.auth.getSession();
    pendingAnonymousAccessToken = currentSession.session?.user.is_anonymous ? currentSession.session.access_token : null;
    const { error } = await supabase.auth.signInWithOtp({
      email: targetEmail,
      options: { shouldCreateUser: false },
    });
    if (error) return log(`已有账户 OTP 未发送：${error.message}`);
    log(`已有账户 OTP 已请求：不存在的邮箱不会被此入口自动注册。${pendingAnonymousAccessToken ? ' 当前匿名愿望将在登录后原子迁移。' : ''}`);
  });

  buttons.verifyLoginOtp.addEventListener('click', async () => {
    const targetEmail = email(inputs.loginEmail);
    const token = otp(inputs.loginOtp);
    if (!targetEmail || !token) return log('请输入已有邮箱和登录验证码。');
    const { data, error } = await supabase.auth.verifyOtp({ email: targetEmail, token, type: 'email' });
    if (error) return log(`登录验证码验证失败：${error.message}`);
    log(`已有账户登录成功：uid=${maskId(data.user?.id)}，匿名=${data.user?.is_anonymous ?? '未返回'}。`);
    if (pendingAnonymousAccessToken) {
      const { data: migration, error: migrationError } = await supabase.functions.invoke('migrate-anonymous-wishes', {
        headers: { 'x-source-authorization': `Bearer ${pendingAnonymousAccessToken}` },
        body: {},
      });
      pendingAnonymousAccessToken = null;
      if (migrationError || !migration?.ok) return log(`匿名愿望迁移失败：${migration?.error ?? migrationError?.message ?? '未知错误'}；源愿望未被删除，可重试。`);
      log(`匿名愿望迁移完成：迁入 ${migration.movedCount} 条；再次调用不会复制愿望。`);
    }
    buttons.writeWish.disabled = false;
    buttons.readWishes.disabled = false;
  });
}
