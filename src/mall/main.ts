import '@fontsource/noto-sans-bengali/400.css';
import '@fontsource/noto-sans-bengali/500.css';
import '@fontsource/noto-sans-bengali/700.css';
import { startMallViewer } from './MallViewer';

const el = document.getElementById('app');
if (!el) throw new Error('#app element not found');
startMallViewer(el).catch((e) => {
  console.error(e);
  el.innerHTML = `<pre style="color:#f88;padding:16px">${String(e)}</pre>`;
});
