import sharp from 'sharp';
import { readFileSync, writeFileSync, statSync } from 'fs';
import { join } from 'path';

const tmp = process.env.TEMP || '/tmp';

async function resize(name) {
  const input = join(tmp, 'sb171-' + name + '-gen.png');
  const output = join(tmp, 'sb171-' + name + '-small.jpg');
  await sharp(input).resize(800, 1067, { fit: 'cover' }).jpeg({ quality: 85 }).toFile(output);
  const stats = statSync(output);
  console.log(name + ': ' + stats.size + ' bytes');
  const b64 = readFileSync(output).toString('base64');
  writeFileSync(join(tmp, 'sb171-' + name + '-b64.txt'), b64);
  console.log(name + ' base64: ' + b64.length + ' chars');
}

await resize('engage');
await resize('dream');
await resize('experience');
console.log('Done');
