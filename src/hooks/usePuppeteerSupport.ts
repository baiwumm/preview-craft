/*
 * @Author: 白雾茫茫丶<baiwumm.com>
 * @Date: 2026-01-19 15:57:42
 * @LastEditors: 白雾茫茫丶<baiwumm.com>
 * @LastEditTime: 2026-01-19 15:58:01
 * @Description: 判断是否支持 puppeteer
 */
'use client';

import { useEffect, useState } from 'react';

export function usePuppeteerSupport() {
  const [isPuppeteerSupported, setIsPuppeteerSupported] = useState<boolean>(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const res = await fetch('/api/capabilities', {
          method: 'GET',
        });

        if (!res.ok) return;

        const { puppeteer } = await res.json();

        if (!cancelled && typeof puppeteer === 'boolean') {
          setIsPuppeteerSupported(puppeteer);
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) {
          setChecked(true);
        }
      }
    }

    check();

    return () => {
      cancelled = true;
    };
  }, []);

  return { isPuppeteerSupported, checked };
}
