/*
 * @Author: 白雾茫茫丶<baiwumm.com>
 * @Date: 2026-01-19 13:45:08
 * @LastEditors: 白雾茫茫丶<baiwumm.com>
 * @LastEditTime: 2026-01-19 14:14:17
 * @Description: 调用截图 Api
 */
import mql from '@microlink/mql';
import { NextRequest, NextResponse } from 'next/server';

import { DEVICES } from '@/enums';

export async function POST(request: NextRequest) {
  try {
    const { url, width, height, theme, device } = await request.json();

    if (!url) {
      return NextResponse.json({
        message: '缺少 url 参数',
        status: 'fail',
      });
    }
    const { data, status } = await mql(url, {
      screenshot: true,
      meta: false,
      colorScheme: theme,
      viewport: {
        width,
        height,
        isMobile: device === DEVICES.MOBILE,
        deviceScaleFactor: 1,
      },
    });

    // 请求失败
    if (status !== 'success') {
      return Response.json(
        { error: '截图失败!' },
        { status: 500 }
      )
    }
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: '截图失败!' },
      { status: 500 });
  }
}