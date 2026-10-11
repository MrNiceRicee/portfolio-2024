import { initializeAppearanceMenu } from "./appearanceMenu";

type ThemePreference = "light" | "dark" | "system";

/** the head resolves startup once; this controller owns subsequent visitor intent */
export function initializePortfolioTheme() {
  const root = document.documentElement;
  const initial = root.dataset.themePreference;
  let preference: ThemePreference = initial === "light" || initial === "dark" ? initial : "system";
  const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
  const controls = document.querySelector<HTMLElement>("[data-theme-controls]");
  const buttons = controls?.querySelectorAll<HTMLButtonElement>("[data-theme-choice]");
  const trigger = controls?.querySelector<HTMLButtonElement>("[data-theme-trigger]");
  const label = controls?.querySelector<HTMLElement>("[data-theme-label]");
  const icons = controls?.querySelectorAll<HTMLElement>("[data-appearance-icon]");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const themeColor = document.querySelector('meta[name="theme-color"]');
  const appleStatus = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  const lifetime = new AbortController();
  const options = { signal: lifetime.signal };

  const finishArtwork = () => {
    icons?.forEach((icon) => { icon.dataset.instant = "true"; });
  };
  const updateDeviceArtwork = () => {
    icons?.forEach((icon) => {
      if (icon.dataset.appearanceIcon === "system") icon.dataset.deviceTheme = systemTheme.matches ? "dark" : "light";
    });
  };
  const update = (keyboard = true) => {
    const dark = preference === "dark" || (preference === "system" && systemTheme.matches);
    root.dataset.themePreference = preference;
    root.classList.toggle("dark", dark);
    themeColor?.setAttribute("content", dark
      ? document.body.dataset.darkcolor ?? "#181615"
      : document.body.dataset.lightcolor ?? "#ebebec");
    appleStatus?.setAttribute("content", dark ? "black-translucent" : "default");
    buttons?.forEach((button) => { button.setAttribute("aria-checked", String(button.dataset.themeChoice === preference)); });
    const currentLabel = preference.charAt(0).toUpperCase() + preference.slice(1);
    if (controls) controls.dataset.preference = preference;
    if (label) label.textContent = currentLabel;
    trigger?.setAttribute("aria-label", `Appearance: ${currentLabel}`);
    icons?.forEach((icon) => {
      icon.dataset.instant = String(keyboard || reduced.matches);
      icon.dataset.state = icon.dataset.appearanceIcon === preference ? "active" : "idle";
    });
  };

  buttons?.forEach((button) => button.addEventListener("click", (event) => {
    const value = button.dataset.themeChoice;
    if (value !== "light" && value !== "dark" && value !== "system") return;
    if (preference === value) { event.stopImmediatePropagation(); return; }
    preference = value;
    try { window.localStorage.setItem("portfolio-theme", preference); } catch {}
    // a preview must not override an intentional choice on the next reload
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("theme")) {
        url.searchParams.delete("theme");
        window.history.replaceState(window.history.state, "", url.href);
      }
    } catch {}
    update(event.detail === 0);
  }, options));
  // current-choice activation must not interrupt an in-flight drawing
  const isSelectedChoice = (target: EventTarget | null) => Array.from(buttons ?? []).some((button) =>
    button.dataset.themeChoice === preference && button.contains(target as Node | null));
  document.addEventListener("pointerdown", (event) => {
    if (isSelectedChoice(event.target)) event.stopImmediatePropagation();
  }, { ...options, capture: true });
  controls?.addEventListener("keydown", (event) => {
    if (event.isComposing) return;
    if (["Enter", " ", "Control", "Alt", "Meta", "Shift"].includes(event.key) && isSelectedChoice(event.target)) event.stopImmediatePropagation();
  }, { ...options, capture: true });
  reduced.addEventListener("change", finishArtwork, options);
  systemTheme.addEventListener("change", () => {
    finishArtwork();
    updateDeviceArtwork();
    if (preference === "system") update();
  }, options);
  window.addEventListener("pagehide", (event) => {
    finishArtwork();
    if (!event.persisted) lifetime.abort();
  }, options);
  updateDeviceArtwork();
  update();
  if (controls) {
    initializeAppearanceMenu(controls, lifetime.signal);
    controls.hidden = false;
  }
}
