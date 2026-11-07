import { parseHash, type Route } from "./routes";

export { href, type Route } from "./routes";

class Router {
  route = $state<Route>({ name: "sheet", view: "sheet" });

  init() {
    const sync = () => (this.route = parseHash(location.hash));
    sync();
    addEventListener("hashchange", sync);
  }
}

export const router = new Router();
