import Store from 'electron-store';

import type { AppSettings, SessionSnapshot, Template } from '@shared/types';

export const defaultSettings: AppSettings = {
  theme: 'dark',
  format: 'png',
  scale: 2
};

/**
 * 设置存储。key 带版本号，读写均做 try-catch 兜底。
 */
const store = new Store<{ settings: AppSettings; 'templates:v1'?: Template[]; 'session:v1'?: SessionSnapshot }>({
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

/**
 * 上次会话快照（key: session:v1）。读时做最小形状校验：磁盘上可能是更早版本留下的
 * 结构，宁可当作「没有会话」也不要启动即崩。
 */
export function getSession(): SessionSnapshot | null {
  try {
    const snap = store.get('session:v1');
    if (!snap || typeof snap !== 'object') return null;
    const { template } = snap;
    if (!template || !Array.isArray(template.placements) || !template.canvas?.width || !template.canvas?.height) {
      return null;
    }
    return snap;
  } catch {
    return null;
  }
}

export function setSession(snapshot: SessionSnapshot): void {
  try {
    store.set('session:v1', snapshot);
  } catch {
    // 写失败就丢掉这一份，下次启动回落默认会话
  }
}
