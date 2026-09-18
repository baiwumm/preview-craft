// 校验 PNG 尺寸（IHDR: 宽高在字节 16-23），P5 移除
import { readFile } from 'node:fs/promises';

const files = process.argv.slice(2);
for (const file of files) {
  const buf = await readFile(file);
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  console.log(`${file}: ${width}x${height}`);
}
