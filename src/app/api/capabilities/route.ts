/*
 * @Author: 白雾茫茫丶<baiwumm.com>
 * @Date: 2026-01-19 15:53:32
 * @LastEditors: 白雾茫茫丶<baiwumm.com>
 * @LastEditTime: 2026-01-19 15:53:40
 * @Description: 判断是否支持 puppeteer
 */
import { NextResponse } from 'next/server';

import { isPuppeteerAvailable } from '@/lib/puppeteerAvailable';

export const runtime = 'nodejs';

export async function GET() {
  const ok = await isPuppeteerAvailable();

  return NextResponse.json({
    puppeteer: ok,
  });
}
