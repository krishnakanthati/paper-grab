// The YouTube Playables build of index.html: no calls or references to outside URLs except Google's own SDK. The web page keeps its
// share and canonical tags (they point at the public site); here they are removed, along with any other tag carrying an outside URL.
export function forPlayables(html) {
  const lines = html.split('\n').filter(line => {
    if (/property="og:|name="twitter:|rel="canonical"/.test(line)) return false;
    const urls = line.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
    return urls.every(u => /^https:\/\/www\.youtube\.com\//.test(u));
  });
  return lines.join('\n').replace('<script src="game.js"></script>', '<script type="module" src="game.js"></script>');
}
