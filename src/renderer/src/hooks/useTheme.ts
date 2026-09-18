import { useCallback, useEffect, useState } from 'react';

import type { AppSettings } from '@shared/types';

type Theme = AppSettings['theme'];

/** 明暗主题：应用 .dark/.light + data-theme，选择持久化到 electron-store */
export function useTheme(): { theme: Theme; toggleTheme: () => void } {
  const [theme, setTheme] = useState<Theme>('dark');

  // 启动时读取持久化设置
  useEffect(() => {
    window.api
      ?.settingsGet()
      .then((settings) => {
        if (settings.theme) setTheme(settings.theme);
      })
      .catch(() => undefined);
  }, []);

  // 主题应用到根元素
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    root.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      window.api?.settingsSet({ theme: next }).catch(() => undefined);
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
