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
};
const log = (message) => { logElement.textContent = `${new Date().toISOString()} ${message}\n${logElement.textContent}`; };

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
    log(`会话已就绪：uid=${result.data.user.id}，匿名=${result.data.user.is_anonymous}`);
    buttons.writeWish.disabled = false;
    buttons.readWishes.disabled = false;
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
    log(`测试愿望已写入：wish=${data.id}，owner=${data.owner_id}，状态=${data.status}`);
  });

  buttons.readWishes.addEventListener('click', async () => {
    const { data, error } = await supabase.from('wishes').select('id, owner_id, status, created_at').order('created_at', { ascending: false });
    if (error) return log(`读取失败：${error.message}`);
    log(`读取成功：${data.length} 条愿望；仅返回当前 uid 的记录由 RLS 保证。`);
  });
}
