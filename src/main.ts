import '@fontsource/noto-sans-bengali/400.css';
import '@fontsource/noto-sans-bengali/500.css';
import '@fontsource/noto-sans-bengali/700.css';
import type { Engine } from './core/Engine';
import { bn } from './i18n';
import { Splash } from './ui/Splash';
import { Watermark } from './ui/Watermark';

const container = document.getElementById('app');
if (!container) throw new Error('#app element not found');

// Logo splash shows immediately and stays until the engine is ready.
const splash = new Splash();

// Engine is imported dynamically so the splash can paint before the big game bundle is parsed.
// Wait for the logo intro to play out first: loading the engine blocks the main thread and would freeze the animation.
splash.introDone
  .then(() => import('./core/Engine'))
  .then(({ Engine }) => Engine.create(container))
  .then(async (engine) => {
    await engine.warmUp().catch(() => undefined); // compile the vehicle / person shaders behind the splash
    engine.start();
    new Watermark();
    void splash.finish();
    // Dev only: handy in the browser console, e.g. __engine.camera.position.set(0, 300, 0)
    if (import.meta.env.DEV) (window as unknown as { __engine: Engine }).__engine = engine;
  })
  .catch((err) => {
    splash.dispose();
    console.error(err);
    container.innerHTML = `<pre style="color:#f88;padding:16px">${bn.errors.engineFailed}:\n${String(err)}</pre>`;
  });
