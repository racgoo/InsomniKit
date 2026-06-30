/**
 * Desktop widget renderer. Same contract as the main window — a small,
 * glanceable surface: status, the toggle, live timer/battery, and quick
 * duration chips. Chips are built once; the per-push paint only updates
 * text + selected state (no rebuild, no flicker).
 */
(() => {
  const bridge = window.insomnikit;
  const el = <T extends HTMLElement>(id: string): T =>
    document.getElementById(id) as T;
  const send = (action: IKAction): void => bridge.send(action);

  const widget = el("widget");
  const appName = el("appName");
  const dot = el("dot");
  const statusText = el("statusText");
  const closeBtn = el<HTMLButtonElement>("closeBtn");
  const powerBtn = el<HTMLButtonElement>("powerBtn");
  const timerLine = el("timerLine");
  const batteryLine = el("batteryLine");
  const lidBtn = el<HTMLButtonElement>("lidBtn");
  const lidLabel = el("lidLabel");
  const chipsHost = el("durationChips");

  let cur: IKViewModel | null = null;
  let built = false;
  const chips: HTMLButtonElement[] = [];

  powerBtn.addEventListener("click", () => send({ type: "toggleActive" }));
  closeBtn.addEventListener("click", () => send({ type: "closeWidget" }));
  // Toggle "stay awake with the lid closed" — fires the same admin sheet
  // as the window/tray. Use the last-painted state to flip it.
  lidBtn.addEventListener("click", () =>
    send({ type: "setLidClosed", value: !(cur && cur.lidApplied) }),
  );

  function build(vm: IKViewModel): void {
    chipsHost.replaceChildren();
    chips.length = 0;
    vm.durationPresets.forEach((opt) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "wchip";
      b.addEventListener("click", () => send({ type: "setDuration", value: opt.value }));
      chipsHost.appendChild(b);
      chips.push(b);
    });
    built = true;
  }

  function paint(vm: IKViewModel): void {
    cur = vm;
    const L = vm.labels;
    appName.textContent = L.appName;
    lidLabel.textContent = L.stayAwakeWhenClosed;
    // Native hover tooltip — the widget is too small for an inline ⓘ, but
    // the full explanation is one hover away (and the OS tooltip renders
    // even over this frameless, always-on-top window).
    lidBtn.title = L.stayAwakeTip;
    lidBtn.classList.toggle("on", vm.lidApplied);
    statusText.textContent = vm.statusText;
    dot.classList.toggle("on", vm.active);
    widget.classList.toggle("awake", vm.active);
    powerBtn.textContent = vm.active ? L.disable : L.enable;
    powerBtn.classList.toggle("active", vm.active);
    timerLine.textContent = vm.timerLine;
    // Drop any emoji (e.g. the charging ⚡) — keep the widget text clean.
    batteryLine.textContent = vm.batteryLine.replace(/\s*\p{Extended_Pictographic}/gu, "").trim();

    vm.durationPresets.forEach((opt, i) => {
      const b = chips[i];
      if (!b) return;
      // Compact chip labels: presets read "15 minutes" in the menu, too
      // wide here — show the bare number, ∞ for infinite.
      b.textContent = opt.value === null ? "∞" : String(opt.value);
      b.classList.toggle("sel", opt.selected);
    });
  }

  function render(vm: IKViewModel): void {
    if (!built) build(vm);
    paint(vm);
  }

  bridge.onViewModel(render);
  void bridge.getViewModel().then(render);
})();
