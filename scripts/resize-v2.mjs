import sharp from 'sharp';
import { readFileSync, writeFileSync, statSync } from 'fs';
import { join } from 'path';

const tmp = process.env.TEMP || '/tmp';

async function resize(name) {
  const input = join(tmp, 'sb171-v2-' + name + '.jpg');
  const output = join(tmp, 'sb171-v2-' + name + '-micro.jpg');
  await sharp(input).resize(300, 400, { fit: 'cover' }).jpeg({ quality: 60 }).toFile(output);
  const stats = statSync(output);
  const b64 = readFileSync(output).toString('base64');
  writeFileSync(join(tmp, 'sb171-v2-' + name + '-b64.txt'), b64);
  console.log(name + ': ' + stats.size + ' bytes, b64: ' + b64.length + ' chars');
}

await resize('engage');
await resize('dream');
await resize('experience');
console.log('Done');
