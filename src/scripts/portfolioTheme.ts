type ThemePreference = "light" | "dark" | "system";

/** the head resolves startup once; this controller owns subsequent visitor intent */
export function initializePortfolioTheme() {
  const root = document.documentElement;
  const initial = root.dataset.themePreference;
  let preference: ThemePreference = initial === "light" || initial === "dark" ? initial : "system";
  const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
  const controls = document.querySelector<HTMLFieldSetElement>("[data-theme-controls]");
  const radios = controls?.querySelectorAll<HTMLInputElement>('input[name="portfolio-theme"]');
  const themeColor = document.querySelector('meta[name="theme-color"]');
  const appleStatus = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  const lifetime = new AbortController();
  const options = { signal: lifetime.signal };

  const update = () => {
    const dark = preference === "dark" || (preference === "system" && systemTheme.matches);
    root.dataset.themePreference = preference;
    root.classList.toggle("dark", dark);
    themeColor?.setAttribute("content", dark
      ? document.body.dataset.darkcolor ?? "#181615"
      : document.body.dataset.lightcolor ?? "#ebebec");
    appleStatus?.setAttribute("content", dark ? "black-translucent" : "default");
    radios?.forEach((radio) => { radio.checked = radio.value === preference; });
  };

  radios?.forEach((radio) => radio.addEventListener("change", () => {
    const value = radio.value;
    if (!radio.checked || (value !== "light" && value !== "dark" && value !== "system")) return;
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
    update();
  }, options));
  systemTheme.addEventListener("change", () => {
    if (preference === "system") update();
  }, options);
  window.addEventListener("pagehide", (event) => {
    if (!event.persisted) lifetime.abort();
  }, options);
  update();
  if (controls) controls.hidden = false;
}
