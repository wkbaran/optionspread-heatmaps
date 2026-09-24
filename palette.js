// Palette switcher (the swatch button in the lower left). Ported from equity-watch.
//
// The page's stylesheet reads exactly three custom properties off <html>:
// --p-ground (the background in dark mode), --p-ink (the text in dark mode)
// and --p-signal (the one accent). Every other colour is mixed from those
// three, and light mode swaps ground and ink, so a palette is a complete theme.
//
// The page declares the default with data-palette="ground,ink,signal" on
// <html>. A chosen palette is remembered per browser. Loaded in <head>, before
// first paint, so the page never flashes another palette.

(() => {
  "use strict";
  const KEY = "optionspread.palette";
  const root = document.documentElement;

  const PRESETS = [
    { name: "Petrol and sodium", colors: ["#0e2a31", "#ece4d0", "#f3a83b"] },
    { name: "Walnut and cyan", colors: ["#241a12", "#f2e8d3", "#57c7f5"] },
    { name: "Oxblood and brass", colors: ["#2b1016", "#f1e2de", "#e6c160"] },
    { name: "Moss and coral", colors: ["#15201a", "#e2ecdc", "#ff8a66"] },
    { name: "Ink and violet", colors: ["#15162b", "#e6e4f5", "#b69bff"] },
    { name: "Carbon and signal red", colors: ["#1a1b1d", "#ecebe6", "#ff5a4e"] },
  ];

  const pageDefault = (root.dataset.palette ?? "").split(",").filter(Boolean);
  const defaults = pageDefault.length === 3 ? pageDefault : PRESETS[0].colors;

  function read() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
      if (Array.isArray(saved) && saved.length === 3) return saved;
    } catch {
      /* fall through to the default */
    }
    return defaults;
  }

  function apply(colors) {
    const [ground, ink, signal] = colors;
    root.style.setProperty("--p-ground", ground);
    root.style.setProperty("--p-ink", ink);
    root.style.setProperty("--p-signal", signal);
  }

  function save(colors) {
    try {
      localStorage.setItem(KEY, JSON.stringify(colors));
    } catch {
      /* the choice just won't persist */
    }
  }

  // Before first paint, so the page never flashes another palette.
  let colors = read();
  apply(colors);

  function el(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "text") node.textContent = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    node.append(...children);
    return node;
  }

  function buildPanel() {
    const inputs = ["Background", "Text", "Accent"].map((label, i) => {
      const id = `pal-${i}`;
      const input = el("input", { type: "color", id, value: colors[i] });
      input.addEventListener("input", () => {
        colors = colors.map((c, j) => (j === i ? input.value : c));
        apply(colors);
        save(colors);
        code.textContent = colors.join(", ");
      });
      return { input, row: el("div", { class: "pal-field" }, input, el("label", { for: id, text: label })) };
    });
    const sync = () => inputs.forEach(({ input }, i) => (input.value = colors[i]));
    const code = el("code", { class: "pal-code", text: colors.join(", ") });

    const presets = el(
      "div",
      { class: "pal-presets" },
      ...PRESETS.map((p) =>
        el(
          "button",
          {
            type: "button",
            class: "pal-preset",
            title: p.name,
            "aria-label": `Use ${p.name}`,
            onclick: () => {
              colors = [...p.colors];
              apply(colors);
              save(colors);
              sync();
              code.textContent = colors.join(", ");
            },
          },
          ...p.colors.map((c) => el("span", { style: `background:${c}` }))
        )
      )
    );

    const reset = el("button", {
      type: "button",
      text: "Reset to this design's default",
      class: "pal-reset",
      onclick: () => {
        colors = [...defaults];
        apply(colors);
        try {
          localStorage.removeItem(KEY);
        } catch {
          /* nothing saved */
        }
        sync();
        code.textContent = colors.join(", ");
      },
    });

    const panel = el(
      "div",
      { class: "pal-panel", id: "pal-panel", role: "dialog", "aria-label": "Palette", hidden: "" },
      el("div", { class: "pal-heading", text: "Palette" }),
      presets,
      ...inputs.map((x) => x.row),
      code,
      reset
    );
    const toggle = el("button", {
      type: "button",
      class: "pal-toggle",
      "aria-expanded": "false",
      "aria-controls": "pal-panel",
      "aria-label": "Palette",
      onclick: () => {
        panel.hidden = !panel.hidden;
        toggle.setAttribute("aria-expanded", String(!panel.hidden));
      },
    });
    toggle.append(...[0, 1, 2].map((i) => el("span", { style: `background:var(--p-${["ground", "ink", "signal"][i]})` })));
    const box = el("div", { class: "pal" }, panel, toggle);
    const close = () => {
      panel.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
    };
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !panel.hidden) close();
    });
    document.addEventListener("pointerdown", (e) => {
      if (!panel.hidden && !box.contains(e.target)) close();
    });
    document.body.append(box);
  }

  document.addEventListener("DOMContentLoaded", buildPanel);
})();
