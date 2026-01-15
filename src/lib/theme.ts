import { THEME } from '@/enums';

const THEME_KEY = "theme";

export function getInitialTheme(): App.Theme {
  const stored = localStorage.getItem(THEME_KEY) as App.Theme | null;
  if (stored) return stored;

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? THEME.DARK
    : THEME.LIGHT;
}

export function applyTheme(theme: App.Theme) {
  const root = document.documentElement;
  root.classList.toggle(THEME.DARK, theme === THEME.DARK);
  localStorage.setItem(THEME_KEY, theme);
}
