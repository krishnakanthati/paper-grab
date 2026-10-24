// Cache busting: browsers (and GitHub Pages) may keep serving an old style.css or game.js next to a new index.html, which
// shows up as a broken, unstyled page right after an update. The build stamps each asset URL with a hash of its content, so a
// changed file always has a new URL and an unchanged one stays cached.
import { createHash } from 'node:crypto';

export const hashOf = (bytes) => createHash('sha256').update(bytes).digest('hex').slice(0, 8);

/** Add `?v=<hash>` to the page's references to the given files (`{ 'style.css': 'ab12cd34', ... }`). */
export function bust(html, hashes) {
  let out = html;
  for (const [file, h] of Object.entries(hashes)) {
    const esc = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(`((?:href|src)=")${esc}(?:\\?v=[0-9a-f]+)?(")`, 'g'), `$1${file}?v=${h}$2`);
  }
  return out;
}
