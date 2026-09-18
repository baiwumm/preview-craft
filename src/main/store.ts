import Store from 'electron-store';

import type { AppSettings } from '@shared/types';

export const defaultSettings: AppSettings = {
  theme: 'dark',
  format: 'png',
  scale: 2
};

/**
 * 设置存储。key 带版本号，读写均做 try-catch 兜底。
 */
const store = new Store<{ settings: AppSettings }>({
  name: 'settings',
  defaults: { settings: defaultSettings }
});

export function getSettings(): AppSettings {
  try {
    return { ...defaultSettings, ...store.get('settings') };
  } catch {
    return { ...defaultSettings };
  }
}

export function setSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...getSettings(), ...patch };
  try {
    store.set('settings', next);
  } catch {
    // 写入失败时仍返回内存中的合并结果
  }
  return next;
}
