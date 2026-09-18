// 从 get_component_docs 输出提取可读文档（去 JSON 转义）
import { readFileSync, writeFileSync } from 'node:fs';

const raw = readFileSync(process.argv[2], 'utf8');
const start = raw.indexOf('{');
const end = raw.lastIndexOf('}');
const json = JSON.parse(raw.slice(start, end + 1));
let out = '';
for (const item of json.results ?? []) {
  out += `\n\n===== ${item.component} =====\n`;
  let content = item.content ?? '';
  content = content.replace(/<page [^>]*>/g, '').replace(/<\/page>/g, '');
  // 截断 examples 之后的冗长部分，保留 Usage/Anatomy/Props
  const propsIdx = content.indexOf('## Props');
  const examplesIdx = content.indexOf('## Examples');
  const cut = examplesIdx > 0 ? examplesIdx : Math.min(content.length, propsIdx + 4000);
  out += content.slice(0, Math.min(cut, 9000));
}
writeFileSync(process.argv[3], out, 'utf8');
console.log('written', process.argv[3]);
