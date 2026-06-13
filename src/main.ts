import "./style.css";

import { clear, h } from "./ui/dom";
import { VIEW_LABELS } from "./ui/labels";
import { buildPanel, rerollSeed, undoSeed } from "./ui/panel";
import { loadInitialState, persist } from "./ui/persist";
import { Store, type AppState, type ViewId } from "./ui/store";
import {
  fillStrokeView,
  gridView,
  ladderView,
  lineupView,
  tuneView,
  type ViewUpdate,
} from "./ui/views";

const VIEWS: Record<ViewId, (c: HTMLElement, s: Store) => ViewUpdate> = {
  tune: tuneView,
  lineup: lineupView,
  grid: gridView,
  ladder: ladderView,
  fillStroke: fillStrokeView,
};

const app = document.querySelector<HTMLDivElement>("#app")!;
const store = new Store(loadInitialState());

const tabs = (Object.keys(VIEWS) as ViewId[]).map((id) => {
  const b = h(
    "button",
    { class: "tab", type: "button" },
    VIEW_LABELS[id] ?? id,
  );
  b.addEventListener("click", () => store.set({ view: id }));
  return [id, b] as const;
});

const algChip = h("span", { class: "subtitle" });
const header = h(
  "header",
  { class: "topbar" },
  h(
    "h1",
    {},
    "Organic Design ",
    h("span", { class: "subtitle" }, "有機線條調教工具 · "),
    algChip,
  ),
  h("nav", { class: "tabs" }, ...tabs.map(([, b]) => b)),
);

const panel = buildPanel(store);
const main = h("main", { class: "view" });
app.replaceChildren(header, panel.el, main);

let mountedView: ViewId | null = null;
let viewUpdate: ViewUpdate | null = null;

function render(state: AppState): void {
  panel.sync(state);
  algChip.textContent = state.config.algorithm;
  for (const [id, b] of tabs) b.classList.toggle("active", state.view === id);
  if (mountedView !== state.view) {
    clear(main);
    viewUpdate = VIEWS[state.view](main, store);
    mountedView = state.view;
  }
  viewUpdate!(state);
  persist(state);
}

store.subscribe(render);
render(store.get());

// Keyboard: hold Space = blink comparator (pure geometry), R = reroll, Shift+R = previous seed.
function isTyping(e: KeyboardEvent): boolean {
  const t = e.target;
  return (
    (t instanceof HTMLInputElement && t.type !== "range") ||
    t instanceof HTMLTextAreaElement
  );
}

window.addEventListener("keydown", (e) => {
  // Never shadow browser shortcuts (Cmd/Ctrl+R reloads must not reroll).
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (isTyping(e)) return;
  if (e.code === "Space") {
    e.preventDefault();
    if (!store.get().blink) store.set({ blink: true });
  } else if (e.key === "r") {
    rerollSeed(store);
  } else if (e.key === "R") {
    undoSeed(store);
  }
});
window.addEventListener("keyup", (e) => {
  if (e.code === "Space" && store.get().blink) store.set({ blink: false });
});
window.addEventListener("blur", () => {
  if (store.get().blink) store.set({ blink: false });
});
