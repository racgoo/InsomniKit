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

  const appName = el("appName");
  const dot = el("dot");
  const statusText = el("statusText");
  const closeBtn = el<HTMLButtonElement>("closeBtn");
  const powerBtn = el<HTMLButtonElement>("powerBtn");
  const timerLine = el("timerLine");
  const batteryLine = el("batteryLine");
  const chipsHost = el("durationChips");

  let built = false;
  const chips: HTMLButtonElement[] = [];

  powerBtn.addEventListener("click", () => send({ type: "toggleActive" }));
  closeBtn.addEventListener("click", () => send({ type: "closeWidget" }));

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
    const L = vm.labels;
    appName.textContent = L.appName;
    statusText.textContent = vm.statusText;
    dot.classList.toggle("on", vm.active);
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
