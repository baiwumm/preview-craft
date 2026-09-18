import Store from 'electron-store';

import type { AppSettings, Template } from '@shared/types';

export const defaultSettings: AppSettings = {
  theme: 'dark',
  format: 'png',
  scale: 2
};

/**
 * 设置存储。key 带版本号，读写均做 try-catch 兜底。
 */
const store = new Store<{ settings: AppSettings; 'templates:v1'?: Template[] }>({
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

/** 自定义模板 CRUD（key: templates:v1） */
export function getCustomTemplates(): Template[] {
  try {
    return store.get('templates:v1') ?? [];
  } catch {
    return [];
  }
}

export function saveCustomTemplate(template: Template): Template[] {
  const list = getCustomTemplates().filter((t) => t.id !== template.id);
  const next = [...list, template];
  try {
    store.set('templates:v1', next);
  } catch {
    // 写入失败时返回内存结果
  }
  return next;
}

export function deleteCustomTemplate(id: string): Template[] {
  const next = getCustomTemplates().filter((t) => t.id !== id);
  try {
    store.set('templates:v1', next);
  } catch {
    // 写入失败时返回内存结果
  }
  return next;
}
