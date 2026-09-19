/** Small bridge so the header search (rendered once, in the layout) can steer whatever page is
 *  currently open without a full navigation: pick a zone or open a sidebar tab on the home page,
 *  or scroll to a section of the current page. */

export type HomeAction = { zone?: string; tab?: "trend" | "evidence" };

const HOME_EVENT = "busulla-home-action";

export function emitHomeAction(action: HomeAction) {
  window.dispatchEvent(new CustomEvent<HomeAction>(HOME_EVENT, { detail: action }));
}

export function onHomeAction(handler: (action: HomeAction) => void) {
  const listener = (e: Event) => handler((e as CustomEvent<HomeAction>).detail);
  window.addEventListener(HOME_EVENT, listener);
  return () => window.removeEventListener(HOME_EVENT, listener);
}

/** Scrolls a section into view and briefly outlines it so the eye finds it. */
export function focusSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
  el.classList.add("bc-flash");
  window.setTimeout(() => el.classList.remove("bc-flash"), 1400);
}
