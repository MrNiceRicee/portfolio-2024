import { initializeAppearanceMenu } from "./appearanceMenu";

type Theme = "light" | "dark" | "system";
type Replay = { frame: number; timer: number; icons: HTMLElement[]; label?: HTMLElement };

const isTheme = (value: string | undefined): value is Theme => value === "light" || value === "dark" || value === "system";
const themeLabel = (theme: Theme) => theme.charAt(0).toUpperCase() + theme.slice(1);

export function initializeAppearanceDemo() {
  const controls = document.querySelector<HTMLElement>("[data-demo-controls]");
  const trigger = controls?.querySelector<HTMLButtonElement>("[data-theme-trigger]");
  const triggerLabel = document.querySelector<HTMLElement>("[data-trigger-label]");
  const stageLabel = document.querySelector<HTMLElement>("[data-stage-label]");
  const systemNote = document.querySelector<HTMLElement>("[data-system-note]");
  const status = document.querySelector<HTMLElement>("[data-demo-status]");
  if (!controls || !trigger || !triggerLabel || !stageLabel || !systemNote || !status) return;

  const signal = new AbortController().signal;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const deviceTheme = matchMedia("(prefers-color-scheme: dark)");
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)");
  const choices = Array.from(controls.querySelectorAll<HTMLButtonElement>("[data-theme-choice]"));
  const replays = new Set<Replay>();
  const initialTheme = document.documentElement.dataset.demoTheme;
  let selected: Theme = isTheme(initialTheme) ? initialTheme : "system";

  const setArt = (icon: HTMLElement, active: boolean, immediate = false) => {
    icon.dataset.instant = String(immediate || reduced.matches);
    icon.dataset.state = active ? "active" : "idle";
  };
  const finishReplay = (replay: Replay) => {
    cancelAnimationFrame(replay.frame);
    clearTimeout(replay.timer);
    replay.icons.forEach((icon) => setArt(icon, true, true));
    if (replay.label) replay.label.textContent = "Active";
    replays.delete(replay);
  };
  const cancelReplays = () => replays.forEach(finishReplay);

  const replayArt = (icons: HTMLElement[], label?: HTMLElement) => {
    // repeat presses cancel the old handoff before staging the next one
    replays.forEach((replay) => {
      if (replay.icons.some((icon) => icons.includes(icon))) finishReplay(replay);
    });
    if (reduced.matches) {
      icons.forEach((icon) => setArt(icon, true, true));
      if (label) label.textContent = "Active";
      return;
    }
    icons.forEach((icon) => setArt(icon, false, true));
    if (label) label.textContent = "Idle";
    const replay: Replay = { frame: 0, timer: 0, icons, ...(label ? { label } : {}) };
    replays.add(replay);
    replay.frame = requestAnimationFrame(() => {
      replay.frame = requestAnimationFrame(() => {
        // allow the idle drawing to paint before the 240 ms css transition
        replay.timer = window.setTimeout(() => {
          icons.forEach((icon) => setArt(icon, true));
          if (label) label.textContent = "Active";
          // retain cancellation ownership until the actual css handoff settles
          const animations = icons.flatMap((icon) => icon.getAnimations({ subtree: true }));
          void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => replays.delete(replay));
        }, 80);
      });
    });
  };

  const applyTheme = () => {
    const dark = selected === "dark" || (selected === "system" && deviceTheme.matches);
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.dataset.demoTheme = selected;
    systemNote.textContent = selected === "system" ? `Device appearance: ${dark ? "Dark" : "Light"}` : "Temporary preview";
  };

  const selectTheme = (theme: Theme, keyboard: boolean) => {
    cancelReplays();
    selected = theme;
    applyTheme();
    const label = themeLabel(theme);
    triggerLabel.textContent = label;
    trigger.setAttribute("aria-label", `Appearance: ${label}`);
    stageLabel.textContent = `${label} · Active`;
    status.textContent = `Preview: ${label}. Active drawing shown.${selected === "system" ? " Follows your device." : ""}`;
    choices.forEach((choice) => {
      const active = choice.dataset.themeChoice === selected;
      choice.setAttribute("aria-checked", String(active));
      const icon = choice.querySelector<HTMLElement>("[data-demo-icon]");
      if (icon) setArt(icon, active, keyboard);
    });
    const liveIcons: HTMLElement[] = [];
    document.querySelectorAll<HTMLElement>("[data-trigger-art], [data-stage-art]").forEach((art) => {
      const active = (art.dataset.triggerArt ?? art.dataset.stageArt) === selected;
      art.hidden = !active;
      const icon = art.querySelector<HTMLElement>("[data-demo-icon]");
      if (icon) {
        setArt(icon, true, true);
        if (active) liveIcons.push(icon);
      }
    });
    if (!keyboard) replayArt(liveIcons);
  };

  // the shared helper owns native menu navigation, dismissal and preventScroll focus
  initializeAppearanceMenu(controls, signal);
  choices.forEach((choice) => {
    choice.addEventListener("click", (event) => {
      const theme = choice.dataset.themeChoice;
      if (isTheme(theme)) selectTheme(theme, event.detail === 0);
    });
    choice.addEventListener("pointerenter", (event) => {
      if (!finePointer.matches || event.pointerType !== "mouse") return;
      controls.dataset.interaction = "pointer";
      const icon = choice.querySelector<HTMLElement>("[data-demo-icon]");
      if (icon) setArt(icon, true);
    });
    choice.addEventListener("pointerleave", () => {
      const icon = choice.querySelector<HTMLElement>("[data-demo-icon]");
      if (icon) setArt(icon, choice.dataset.themeChoice === selected, controls.dataset.interaction === "keyboard");
    });
    choice.addEventListener("focus", () => {
      if (controls.dataset.interaction !== "keyboard") return;
      const icon = choice.querySelector<HTMLElement>("[data-demo-icon]");
      if (icon) setArt(icon, true, true);
    });
    choice.addEventListener("blur", () => {
      const icon = choice.querySelector<HTMLElement>("[data-demo-icon]");
      if (icon) setArt(icon, choice.dataset.themeChoice === selected, controls.dataset.interaction === "keyboard");
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-replay]").forEach((button) => {
    button.addEventListener("click", () => {
      const theme = button.dataset.replay;
      if (!isTheme(theme)) return;
      const artwork = document.querySelector<HTMLElement>(`[data-replay-art="${theme}"]`);
      const icon = artwork?.querySelector<HTMLElement>("[data-demo-icon]");
      const label = artwork?.querySelector<HTMLElement>("[data-replay-label]") ?? undefined;
      if (!icon) return;
      replayArt([icon], label);
      status.textContent = `${themeLabel(theme)} drawing ${reduced.matches ? "shown immediately" : "replayed"}. Preview remains ${themeLabel(selected)}.`;
    });
  });
  reduced.addEventListener("change", () => {
    document.querySelectorAll<HTMLElement>("[data-demo-icon]").forEach((icon) => {
      icon.dataset.instant = String(reduced.matches);
    });
    cancelReplays();
  });
  deviceTheme.addEventListener("change", () => {
    if (selected === "system") applyTheme();
  });
  window.addEventListener("pagehide", cancelReplays);
  selectTheme(selected, true);
}
