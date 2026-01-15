/*
 * @Author: 白雾茫茫丶<baiwumm.com>
 * @Date: 2026-01-13 17:03:51
 * @LastEditors: 白雾茫茫丶<baiwumm.com>
 * @LastEditTime: 2026-01-13 17:25:56
 * @Description: 主题切换
 */
import { Moon, Sun } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type FC, useState } from "react";

import { Button } from "@/components/ui/button";
import { getInitialTheme, type Theme } from "@/lib/theme";

const THEME_KEY = "theme";

const ThemeSwitcher: FC = () => {
  const [theme, setTheme] = useState<Theme>(getInitialTheme());
  const isDark = theme === "dark";

  // 是否支持 View Transition
  const enableTransitions = () =>
    "startViewTransition" in document &&
    window.matchMedia("(prefers-reduced-motion: no-preference)").matches;

  // View Transition + 主题切换
  async function toggleDark() {
    const root = document.documentElement;

    // 不支持动画，直接切
    if (!enableTransitions()) {
      const next = isDark ? "light" : "dark";
      root.classList.toggle("dark", next === "dark");
      localStorage.setItem(THEME_KEY, next);
      setTheme(next);
      return;
    }

    // ⚠️ 关键：同步修改 DOM，View Transition 才能捕获
    await document.startViewTransition(() => {
      const next = root.classList.contains("dark") ? "light" : "dark";
      root.classList.toggle("dark", next === "dark");
      localStorage.setItem(THEME_KEY, next);
      setTheme(next); // React 状态同步 UI
      return next;
    }).ready;

    // 自定义过渡动画
    document.documentElement.animate(
      {
        clipPath: [
          "circle(0% at 100% 0%)",
          "circle(150% at 100% 0%)",
        ],
      },
      {
        duration: 700,
        easing: "ease-in-out",
        pseudoElement: "::view-transition-new(root)",
      }
    );
  }

  return (
    <>
      <Button
        mode="icon"
        aria-label="ThemeSwitcher"
        variant="outline"
        radius="full"
        size="sm"
        onClick={toggleDark}
      >
        <AnimatePresence mode="wait" initial={false}>
          {isDark ? (
            <motion.div
              key="moon"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={{ duration: 0.35, ease: "easeInOut" }}
              className="text-neutral-800 dark:text-neutral-200"
            >
              <Moon />
            </motion.div>
          ) : (
            <motion.div
              key="sun"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={{ duration: 0.35, ease: "easeInOut" }}
              className="text-neutral-800 dark:text-neutral-200"
            >
              <Sun />
            </motion.div>
          )}
        </AnimatePresence>
      </Button>

      {/* 禁用浏览器默认 View Transition 动画 */}
      <style>{`
        ::view-transition-old(root),
        ::view-transition-new(root) {
          animation: none;
          mix-blend-mode: normal;
        }
      `}</style>
    </>
  );
};

export default ThemeSwitcher;
