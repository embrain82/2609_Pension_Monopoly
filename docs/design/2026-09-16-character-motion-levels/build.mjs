import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const out = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(out, '../../..');
const assets = Object.fromEntries(['olli', 'woni', 'danji', 'dalli', 'kori'].map(id => [id, 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'public/assets/characters/allone', id + '.png')).toString('base64')]));
fs.writeFileSync(path.join(out, 'index.html'), fs.readFileSync(path.join(out, 'template.html'), 'utf8').replace('/*ASSET_DATA*/', JSON.stringify(assets)));
console.log('Built five-level motion review.');
