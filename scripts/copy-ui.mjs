import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const uiux = join(here, '..', '..', 'uiux', 'src');
const dest = join(here, '..', 'site', 'ui');

if (!existsSync(join(uiux, 'theme.css'))) {
  console.log('Skipping UI copy; ../uiux is not checked out. Using site/ui as committed.');
} else {
  mkdirSync(dest, { recursive: true });
  copyFileSync(join(uiux, 'themes', 'nes.css'), join(dest, 'nes.css'));
  copyFileSync(join(uiux, 'theme.css'), join(dest, 'theme.css'));
}
