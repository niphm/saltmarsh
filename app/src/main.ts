import "./app.css";
import { mount } from "svelte";
import { registerSW } from "virtual:pwa-register";
import App from "./App.svelte";
import { theme } from "./lib/theme.svelte";
import { router } from "./lib/route.svelte";
import { characters } from "./lib/store.svelte";
import { auth } from "./lib/auth.svelte";
import { sync } from "./lib/sync/engine.svelte";
import { party } from "./lib/party.svelte";

// Every theme file in src/themes is bundled; data-theme picks the active one.
import.meta.glob("./themes/*.css", { eager: true });

theme.init();
router.init();
registerSW({ immediate: true });

// Load saved characters before the first render so the sheet (and its sticky
// status bar) appears in one go instead of shifting in after a loading state.
// If IndexedDB stalls, render anyway; the store fills in when it's ready.
const loaded = characters.init();
await Promise.race([loaded, new Promise(resolve => setTimeout(resolve, 1500))]);

mount(App, { target: document.getElementById("app")! });

// Accounts, sync and the party load after the first render (REQUIREMENTS principle 4: sync is a feature, not a dependency).
if (auth.configured) {
  void (async () => {
    await loaded;
    await sync.init();
    auth.onChange(account => {
      if (account) {
        void sync.start(account.id);
        void party.start(account.id);
      } else {
        void sync.stop();
        void party.stop();
      }
    });
    await auth.init();
  })();
}
