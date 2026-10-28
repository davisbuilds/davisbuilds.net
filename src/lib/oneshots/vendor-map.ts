// The fixed map from third-party URLs that demos load to pinned copies, which
// the sync writes into the demo's page. A third-party load that isn't covered here fails the
// build, so adding a run that uses a new CDN file means adding it here, from a
// pinned package, in a reviewed commit.

// Scripts, by exact URL. `file` is inside the npm package `pkg`.
export const SCRIPTS: Record<string, { pkg: string; file: string; out: string; label: string }> = {
  'https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js': {
    pkg: 'd3',
    file: 'dist/d3.min.js',
    out: 'd3/7.8.5/d3.min.js',
    label: 'd3 7.8.5 (instead of cdnjs.cloudflare.com)',
  },
};

// Google Fonts stylesheets (css2 API) are rebuilt from Fontsource packages.
export const GOOGLE_FONTS_CSS = 'https://fonts.googleapis.com/css2';

type Family =
  | { kind: 'variable'; pkg: string; css: { normal: string; italic?: string }; sourceName: string }
  | { kind: 'static'; pkg: string; sourceName: string };

export const FONT_FAMILIES: Record<string, Family> = {
  Fraunces: { kind: 'variable', pkg: '@fontsource-variable/fraunces', css: { normal: 'opsz.css', italic: 'opsz-italic.css' }, sourceName: 'Fraunces Variable' },
  'IBM Plex Sans': { kind: 'variable', pkg: '@fontsource-variable/ibm-plex-sans', css: { normal: 'wght.css', italic: 'wght-italic.css' }, sourceName: 'IBM Plex Sans Variable' },
  'Martian Mono': { kind: 'variable', pkg: '@fontsource-variable/martian-mono', css: { normal: 'wght.css' }, sourceName: 'Martian Mono Variable' },
  Doto: { kind: 'variable', pkg: '@fontsource-variable/doto', css: { normal: 'wght.css' }, sourceName: 'Doto Variable' },
  'IBM Plex Mono': { kind: 'static', pkg: '@fontsource/ibm-plex-mono', sourceName: 'IBM Plex Mono' },
};

// Preconnect hints to these hosts are commented out once their files are
// served locally.
export const PRECONNECT_HOSTS = new Set(['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com']);

// Inserted after <head> in every served demo page, so a demo can't reach
// another host even from script. It applies inside the sandboxed frame.
export const DEMO_CSP =
  "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; form-action 'none'; base-uri 'none'";

// A sandboxed frame has no web storage: reading localStorage throws, which
// stops any demo that keeps, say, a high score. Demos that mention storage get
// this in-memory stand-in, inserted before their own scripts and listed on the
// run page. It supports both getItem/setItem and property-style access.
export const STORAGE_SHIM =
  "(()=>{const mk=()=>{const d=Object.create(null);const api={getItem:k=>(k=String(k)) in d?d[k]:null,setItem:(k,v)=>{d[String(k)]=String(v)},removeItem:k=>{delete d[String(k)]},clear:()=>{for(const k in d)delete d[k]},key:i=>Object.keys(d)[i]??null};" +
  "return new Proxy(d,{get:(t,k)=>k==='length'?Object.keys(t).length:Object.hasOwn(api,k)?api[k]:t[k],set:(t,k,v)=>{t[k]=String(v);return true}})};" +
  "for(const n of['localStorage','sessionStorage']){try{window[n]}catch{Object.defineProperty(window,n,{value:mk(),configurable:true})}}})();";

// For pages that embed a demo frame. A sandboxed demo can still navigate its
// own frame (by script, meta refresh or a link), and the demo's own CSP doesn't
// govern navigation. The embedding page's frame-src does: it stops the frame
// from loading any other host.
export const EMBED_CSP = "frame-src 'self'";

// The only sandbox flags a demo frame gets. Never add
// allow-same-origin: with allow-scripts, it lets the frame remove its sandbox.
export const DEMO_SANDBOX = 'allow-scripts';
