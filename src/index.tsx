/* @refresh reload */
import { render, Suspense } from "solid-js/web";
import { Router, Route } from "@solidjs/router";
import Fallback from "./views/fallback";
import Login from "./views/login"
import Index from "./views/index";
import "./css/index.css"
window.addEventListener("beforeunload", async () => {
    await window.__TAURI__.core.invoke("reload_window");
});

window.addEventListener("popstate", () => {
    history.pushState(null, document.title, window.location.href);
});

render(
    () => (
        <Suspense fallback={<Fallback />}>
            <Router root={(props) => <>{props.children}</>}>
                <Route path="/" component={Login} />
                <Route path="/authed/" component={Index} />
            </Router>
        </Suspense>
    ),
    document.getElementById("root") as HTMLElement
);
