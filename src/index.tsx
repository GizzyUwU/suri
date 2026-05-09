/* @refresh reload */
import { render, Suspense } from "solid-js/web";
import { Router, Route } from "@solidjs/router";
import Fallback from "./views/fallback";
import Login from "./views/login";
import Index from "./views/index";
import { Toaster } from "solid-toast";
import "./css/index.css";

let reloadRequested = false;
window.addEventListener("unhandledrejection", (event) => {
  console.log(event);
  console.error("[global] unhandled promise rejection", event.reason);
});

window.addEventListener("beforeunload", () => {
  if (reloadRequested) return;
  reloadRequested = true;
  void window.__TAURI__.core.invoke("reload_window");
});

render(
  () => (
    <Suspense fallback={<Fallback />}>
      <Toaster toastOptions={{
        duration: 5000,
        style: {
          background: "",
          color: "",
        },
      }} />
      <Router root={(props) => <>{props.children}</>}>
        <Route path="/" component={Login} />
        <Route path="/authed/" component={Index} />
      </Router>
    </Suspense>
  ),
  document.getElementById("root") as HTMLElement,
);
