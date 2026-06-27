/**
 * Main window renderer. Plain `<script>` (not a module) wrapped in an
 * IIFE — it talks to the main process only through `window.insomnikit`.
 *
 * Rendering is split into a one-time `build()` (creates the segmented
 * controls + the language <select> once) and a per-push `paint()` that
 * only updates text + selected state. Nothing interactive is recreated
 * on the 1-second countdown tick, so the language picker never loses a
 * selection mid-interaction and there is no flicker.
 */
(() => {
  const bridge = window.insomnikit;
  const el = <T extends HTMLElement>(id: string): T =>
    document.getElementById(id) as T;
  const send = (action: IKAction): void => bridge.send(action);

  const appName = el("appName");
  const tagline = el("tagline");
  const widgetBtn = el<HTMLButtonElement>("widgetBtn");
  const powerCard = el("powerCard");
  const statusText = el("statusText");
  const powerLine = el("powerLine");
  const powerBtn = el<HTMLButtonElement>("powerBtn");
  const batteryLine = el("batteryLine");
  const timerLine = el("timerLine");
  const thresholdLine = el("thresholdLine");
  const estimateLine = el("estimateLine");
  const warning = el("warning");
  const settingsTitle = el("settingsTitle");
  const durationLabel = el("durationLabel");
  const durationSeg = el("durationSeg");
  const durationCustom = el<HTMLInputElement>("durationCustom");
  const durationCustomTag = el("durationCustomTag");
  const durationUnit = el("durationUnit");
  const thresholdLabel = el("thresholdLabel");
  const thresholdSeg = el("thresholdSeg");
  const thresholdCustom = el<HTMLInputElement>("thresholdCustom");
  const thresholdCustomTag = el("thresholdCustomTag");
  const thresholdUnit = el("thresholdUnit");
  const lidLabel = el("lidLabel");
  const lidSwitch = el<HTMLInputElement>("lidSwitch");
  const loginLabel = el("loginLabel");
  const loginSwitch = el<HTMLInputElement>("loginSwitch");
  const animateLabel = el("animateLabel");
  const animateSwitch = el<HTMLInputElement>("animateSwitch");
  const languageLabel = el("languageLabel");
  const langSelect = el<HTMLSelectElement>("langSelect");
  const quitBtn = el<HTMLButtonElement>("quitBtn");

  let cur: IKViewModel | null = null;
  let built = false;
  const durBtns: HTMLButtonElement[] = [];
  const thrBtns: HTMLButtonElement[] = [];

  // ── static handlers (attached once) ──
  powerBtn.addEventListener("click", () => send({ type: "toggleActive" }));
  quitBtn.addEventListener("click", () => send({ type: "quit" }));
  widgetBtn.addEventListener("click", () =>
    send({ type: cur?.widgetOpen ? "closeWidget" : "openWidget" }),
  );
  lidSwitch.addEventListener("change", () =>
    send({ type: "setLidClosed", value: lidSwitch.checked }),
  );
  loginSwitch.addEventListener("change", () =>
    send({ type: "setLaunchAtLogin", value: loginSwitch.checked }),
  );
  animateSwitch.addEventListener("change", () =>
    send({ type: "setAnimateIcon", value: animateSwitch.checked }),
  );
  langSelect.addEventListener("change", () =>
    send({ type: "setLocale", value: langSelect.value as IKViewModel["locale"] }),
  );
  bindCommit(durationCustom, 1, 1440, (v) => send({ type: "setDuration", value: v }));
  bindCommit(thresholdCustom, 1, 99, (v) => send({ type: "setThreshold", value: v }));

  function bindCommit(
    input: HTMLInputElement,
    min: number,
    max: number,
    emit: (value: number) => void,
  ): void {
    const commit = (): void => {
      const n = Math.round(Number(input.value));
      if (input.value.trim() !== "" && Number.isFinite(n) && n >= min && n <= max) {
        emit(n);
      } else if (cur) {
        paint(cur); // reject invalid input, snap back to known-good value
      }
    };
    input.addEventListener("change", commit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        commit();
        input.blur();
      }
    });
  }

  /** Create the fixed controls once. Values are static; only labels and
   *  selected state change later, which `paint()` handles in place. */
  function build(vm: IKViewModel): void {
    durationSeg.replaceChildren();
    durBtns.length = 0;
    vm.durationPresets.forEach((opt) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "seg-item";
      b.addEventListener("click", () => send({ type: "setDuration", value: opt.value }));
      durationSeg.appendChild(b);
      durBtns.push(b);
    });

    thresholdSeg.replaceChildren();
    thrBtns.length = 0;
    vm.thresholdPresets.forEach((opt) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "seg-item";
      b.addEventListener("click", () => send({ type: "setThreshold", value: opt.value }));
      thresholdSeg.appendChild(b);
      thrBtns.push(b);
    });

    langSelect.replaceChildren();
    vm.localeOptions.forEach((opt) => {
      const o = document.createElement("option");
      o.value = opt.value;
      langSelect.appendChild(o);
    });

    built = true;
  }

  function paint(vm: IKViewModel): void {
    cur = vm;
    const L = vm.labels;

    appName.textContent = L.appName;
    tagline.textContent = L.tagline;
    statusText.textContent = vm.statusText;
    powerLine.textContent = vm.powerLine;
    powerBtn.textContent = vm.active ? L.disable : L.enable;
    powerCard.classList.toggle("active", vm.active);
    widgetBtn.textContent = vm.widgetOpen ? L.hideWidget : L.showWidget;
    widgetBtn.classList.toggle("on", vm.widgetOpen);

    batteryLine.textContent = vm.batteryLine;
    timerLine.textContent = vm.timerLine;
    thresholdLine.textContent = vm.thresholdLine;
    estimateLine.textContent = vm.batteryEstimate ?? "—";

    if (vm.warning) {
      warning.textContent = vm.warning;
      warning.hidden = false;
    } else {
      warning.hidden = true;
    }

    settingsTitle.textContent = L.settingsSection;
    durationLabel.textContent = L.duration;
    thresholdLabel.textContent = L.threshold;
    durationCustomTag.textContent = L.custom;
    thresholdCustomTag.textContent = L.custom;
    durationUnit.textContent = L.minutesAbbrev;
    thresholdUnit.textContent = L.percentAbbrev;
    lidLabel.textContent = L.stayAwakeWhenClosed;
    loginLabel.textContent = L.launchAtLogin;
    animateLabel.textContent = L.animateIcon;
    languageLabel.textContent = L.language;

    // preset labels + selected state (no DOM rebuild)
    vm.durationPresets.forEach((opt, i) => {
      const b = durBtns[i];
      if (!b) return;
      b.textContent = opt.label;
      b.classList.toggle("sel", opt.selected);
    });
    vm.thresholdPresets.forEach((opt, i) => {
      const b = thrBtns[i];
      if (!b) return;
      b.textContent = opt.label;
      b.classList.toggle("sel", opt.selected);
    });

    // custom inputs — never clobber what the user is typing
    if (document.activeElement !== durationCustom) {
      durationCustom.value =
        vm.customDurationActive && vm.duration !== null ? String(vm.duration) : "";
    }
    durationCustom.classList.toggle("active", vm.customDurationActive);
    if (document.activeElement !== thresholdCustom) {
      thresholdCustom.value =
        vm.customThresholdActive && vm.batteryThreshold !== null
          ? String(vm.batteryThreshold)
          : "";
    }
    thresholdCustom.classList.toggle("active", vm.customThresholdActive);

    lidSwitch.checked = vm.lidApplied;
    loginSwitch.checked = vm.launchAtLogin;
    animateSwitch.checked = vm.animateIcon;

    // language labels + value — leave the <select> alone while the user
    // has it focused/open so reselecting another language always works.
    vm.localeOptions.forEach((opt, i) => {
      const o = langSelect.options[i];
      if (o) o.textContent = opt.label;
    });
    if (document.activeElement !== langSelect) langSelect.value = vm.locale;
  }

  function render(vm: IKViewModel): void {
    if (!built) build(vm);
    paint(vm);
  }

  bridge.onViewModel(render);
  void bridge.getViewModel().then(render);
})();
