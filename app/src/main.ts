import "./app.css";
import { mount } from "svelte";
import { registerSW } from "virtual:pwa-register";
import App from "./App.svelte";
import { theme } from "./lib/theme.svelte";
import { router } from "./lib/route.svelte";
import { characters } from "./lib/store.svelte";

// Every theme file in src/themes is bundled; data-theme picks the active one.
import.meta.glob("./themes/*.css", { eager: true });

theme.init();
router.init();
void characters.init();
registerSW({ immediate: true });

mount(App, { target: document.getElementById("app")! });
