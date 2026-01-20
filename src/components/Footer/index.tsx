/*
 * @Author: 白雾茫茫丶<baiwumm.com>
 * @Date: 2026-01-20 09:11:11
 * @LastEditors: 白雾茫茫丶<baiwumm.com>
 * @LastEditTime: 2026-01-20 09:20:57
 * @Description: 底部版权
 */
import Image from 'next/image';
import { type FC } from 'react';

import pkg from '#/package.json';

type Social = {
  image: string;
  url: string;
  label: string;
}

const Footer: FC = () => {
  // 备案信息
  const IcpLinks: Social[] = [
    {
      image: '/icp.png',
      url: 'https://beian.miit.gov.cn/#/Integrated/index',
      label: process.env.NEXT_PUBLIC_ICP!
    },
    {
      image: '/gongan.png',
      url: 'https://beian.mps.gov.cn/#/query/webSearch',
      label: process.env.NEXT_PUBLIC_GUAN_ICP!
    },
  ]
  return (
    <footer className="p-3 flex flex-col gap-1 justify-center items-center text-xs text-slate-500/75 dark:text-slate-300/75">
      <p className="text-center">
        &copy; {(new Date().getFullYear())} {" "}
        <a
          href={pkg.author.url}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-primary transition-colors"
        >
          {process.env.NEXT_PUBLIC_COPYRIGHT}
        </a>
        . All rights reserved.
      </p>
      <div className="flex items-center flex-col md:flex-row gap-2">
        {IcpLinks.map(({ image, url, label }) => (
          <div key={url} className="flex items-center gap-1">
            <Image src={image!} alt={label} width={14} height={14} />
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-center hover:text-primary transition-colors"
            >
              {label}
            </a>
          </div>
        ))}
      </div>
    </footer>
  )
}
export default Footer;