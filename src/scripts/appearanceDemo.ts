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
  const motionStatus = document.querySelector<HTMLElement>("[data-motion-status]");
  if (!controls || !trigger || !triggerLabel || !stageLabel || !systemNote || !status || !motionStatus) return;

  const signal = new AbortController().signal;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const deviceTheme = matchMedia("(prefers-color-scheme: dark)");
  const choices = Array.from(controls.querySelectorAll<HTMLButtonElement>("[data-theme-choice]"));
  const replays = new Set<Replay>();
  const initialTheme = document.documentElement.dataset.demoTheme;
  let selected: Theme = isTheme(initialTheme) ? initialTheme : "system";

  let lastAction: "keyboard" | "selection" | "replay" = "keyboard";
  const updateMotionStatus = (action = lastAction) => {
    lastAction = action;
    motionStatus.textContent = reduced.matches
      ? "prefers-reduced-motion: reduce · Motion suppressed; final artwork shown."
      : `prefers-reduced-motion: no-preference · ${action === "keyboard" ? "Keyboard changes are immediate; Replay uses 280 ms." : "280 ms opacity / rotation / scale handoff."}`;
  };
  const cancelIconAnimations = (icon: HTMLElement) => {
    icon.getAnimations({ subtree: true }).forEach((animation) => animation.cancel());
  };
  const setArt = (icon: HTMLElement, active: boolean, immediate = false) => {
    icon.dataset.instant = String(immediate || reduced.matches);
    icon.dataset.state = active ? "active" : "idle";
  };
  const finishReplay = (replay: Replay) => {
    cancelAnimationFrame(replay.frame);
    clearTimeout(replay.timer);
    replay.icons.forEach((icon) => {
      setArt(icon, true, true);
      cancelIconAnimations(icon);
    });
    if (replay.label) replay.label.textContent = "Active";
    replays.delete(replay);
  };
  const cancelReplays = () => replays.forEach(finishReplay);
  const cancelMotion = () => {
    cancelReplays();
    document.querySelectorAll<HTMLElement>("[data-demo-icon]").forEach(cancelIconAnimations);
  };

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
        // allow the idle drawing to paint before the 280 ms css transition
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
    const repeat = theme === selected;
    cancelMotion();
    selected = theme;
    controls.dataset.interaction = keyboard ? "keyboard" : "pointer";
    updateMotionStatus(keyboard ? "keyboard" : "selection");
    applyTheme();
    const label = themeLabel(theme);
    triggerLabel.textContent = label;
    trigger.setAttribute("aria-label", `Appearance: ${label}`);
    stageLabel.textContent = `${label} · Active`;
    status.textContent = `Preview: ${label}. Active drawing shown.${selected === "system" ? " Follows your device." : ""}`;
    const menuIcons: HTMLElement[] = [];
    choices.forEach((choice) => {
      const active = choice.dataset.themeChoice === selected;
      choice.setAttribute("aria-checked", String(active));
      const icon = choice.querySelector<HTMLElement>("[data-demo-icon]");
      if (icon) {
        setArt(icon, active, keyboard);
        if (active && repeat) menuIcons.push(icon);
      }
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
    if (!keyboard) replayArt([...menuIcons, ...liveIcons]);
  };

  // capture owns demo selection; the shared helper still owns navigation and dismissal
  choices.forEach((choice) => {
    choice.addEventListener("click", (event) => {
      const theme = choice.dataset.themeChoice;
      if (!isTheme(theme)) return;
      event.stopImmediatePropagation();
      selectTheme(theme, event.detail === 0);
    }, { capture: true, signal });
  });
  controls.addEventListener("keydown", (event) => {
    if (event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return;
    cancelMotion();
    updateMotionStatus("keyboard");
  }, { signal });
  initializeAppearanceMenu(controls, signal);
  document.querySelectorAll<HTMLButtonElement>("[data-replay]").forEach((button) => {
    button.addEventListener("click", () => {
      const theme = button.dataset.replay;
      if (!isTheme(theme)) return;
      const artwork = document.querySelector<HTMLElement>(`[data-replay-art="${theme}"]`);
      const icon = artwork?.querySelector<HTMLElement>("[data-demo-icon]");
      const label = artwork?.querySelector<HTMLElement>("[data-replay-label]") ?? undefined;
      if (!icon) return;
      replayArt([icon], label);
      updateMotionStatus("replay");
      status.textContent = `${themeLabel(theme)} drawing ${reduced.matches ? "shown immediately" : "replayed"}. Preview remains ${themeLabel(selected)}.`;
    });
  });
  reduced.addEventListener("change", () => {
    document.querySelectorAll<HTMLElement>("[data-demo-icon]").forEach((icon) => {
      icon.dataset.instant = String(reduced.matches);
    });
    cancelMotion();
    updateMotionStatus();
  });
  deviceTheme.addEventListener("change", () => {
    if (selected === "system") applyTheme();
  });
  window.addEventListener("pagehide", cancelMotion);
  selectTheme(selected, true);
}
