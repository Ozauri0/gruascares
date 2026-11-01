"use client";

import { useEffect, useState } from "react";
import Icon from "./Icon";
import { THEME_STORAGE_KEY, ThemeMode, nextTheme, resolveTheme } from "../lib/theme";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>("light");

  useEffect(() => {
    const read = (): ThemeMode => {
      const attr = document.documentElement.getAttribute("data-theme");
      if (attr === "light" || attr === "dark") return attr;
      let stored: string | null = null;
      try {
        stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      } catch {}
      const prefersDark = typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
      return resolveTheme(stored, prefersDark);
    };
    const initial = read();
    setTheme(initial);
    document.documentElement.setAttribute("data-theme", initial);

    const mq = typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    const onSystemChange = (e: MediaQueryListEvent) => {
      try {
        if (window.localStorage.getItem(THEME_STORAGE_KEY)) return;
      } catch {}
      const mode: ThemeMode = e.matches ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", mode);
      setTheme(mode);
    };
    mq?.addEventListener?.("change", onSystemChange);
    return () => mq?.removeEventListener?.("change", onSystemChange);
  }, []);

  function toggle() {
    const next = nextTheme(theme);
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {}
  }

  const isDark = theme === "dark";
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={isDark ? "Cambiar a modo día" : "Cambiar a modo noche"}
      aria-pressed={isDark}
      title={isDark ? "Modo día" : "Modo noche"}
      data-gc-ui="1"
    >
      <Icon name={isDark ? "sun" : "moon"} bare />
    </button>
  );
}
