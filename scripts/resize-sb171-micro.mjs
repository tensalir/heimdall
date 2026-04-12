import sharp from 'sharp';
import { readFileSync, writeFileSync, statSync } from 'fs';
import { join } from 'path';

const tmp = process.env.TEMP || '/tmp';

async function resize(name, w, h, q) {
  const input = join(tmp, 'sb171-' + name + '-gen.png');
  const output = join(tmp, 'sb171-' + name + '-micro.jpg');
  await sharp(input).resize(w, h, { fit: 'cover' }).jpeg({ quality: q }).toFile(output);
  const stats = statSync(output);
  const b64 = readFileSync(output).toString('base64');
  writeFileSync(join(tmp, 'sb171-' + name + '-microb64.txt'), b64);
  console.log(name + ': ' + stats.size + ' bytes, b64: ' + b64.length + ' chars');
}

await resize('engage', 300, 400, 60);
await resize('dream', 300, 400, 60);
await resize('experience', 300, 400, 60);
console.log('Done');
