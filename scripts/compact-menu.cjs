'use strict';
// Rebuild the presentation layer without modifying the legacy release fixture or command logic.
module.exports = function applyCompactMenu(src, menuSource) {
  function replace(before, after, name) {
    const parts = src.split(before);
    if (parts.length !== 2) throw new Error(`Compact menu ${name}: expected one anchor; got ${parts.length - 1}`);
    src = parts[0] + after + parts[1];
  }
  replace('  let automationUI = null;', menuSource + '\n  let automationUI = null;\n  let compactMenu = null;', 'bundle module');
  replace('if (headline) headline.textContent = state.running', 'if (!compactMenu && headline) headline.textContent = state.running', 'stable title');
  replace('      toggle.textContent = collapsed ? "+" : "−";',
    '      if (compactMenu) compactMenu.setCollapsed(collapsed);\n      else toggle.textContent = collapsed ? "+" : "−";', 'collapse');
  replace('    const maxY = Math.max(8, window.innerHeight - 84);',
    '    const maxY = Math.max(8, window.innerHeight - (collapsed ? 68 : 220));', 'viewport floor');
  replace('Math.max(76, window.innerHeight - y - 8)',
    'Math.max(52, window.innerHeight - y - 8)', 'height bounds');
  replace('    document.body.appendChild(panel);', `    compactMenu = mountCompactMenu({
      document, panel, body, header, headline, toggle, grip, controls,
      startButton: startBtn, stopButton: stopBtn, resetButton,
      settings: settingsPanel, toggles, protectionToggles: standaloneToggles,
      tools, fields, updateStatus, updateControls, copyButton, diagnosticStatus,
      automationUI, version: VERSION, storage: localStorage, collapsed
    });
    document.body.appendChild(panel);`, 'mount');
  replace(`      positionPanel(savedPosition.left, savedPosition.top, false);
    }
    window.addEventListener("resize",`, `      positionPanel(savedPosition.left, savedPosition.top, false);
    } else {
      const initial = panel.getBoundingClientRect();
      positionPanel(initial.left, initial.top, false);
    }
    window.addEventListener("resize",`, 'initial bounds');
  replace('      el.style.borderColor = active ? "#65d88c" : "#456052";',
    '      el.style.borderColor = active ? "#65d88c" : "#456052";\n      el.setAttribute("aria-pressed", String(active));', 'selected semantics');
  replace('      stroke.changed = true;',
    '      hit.button.setAttribute("aria-pressed", String(stroke.select));\n      stroke.changed = true;', 'drag semantics');
  replace('      el.title = `${side === "left" ? "Links" : "Rechts"}: Reihe ${Math.floor(i / 10) + 1}, Spalte ${i % 10 + 1}`;',
    '      el.title = `${side === "left" ? "Links" : "Rechts"}: Reihe ${Math.floor(i / 10) + 1}, Spalte ${i % 10 + 1}`;\n      el.setAttribute("aria-label", el.title);', 'field label');
  replace(`    if (updateLink) updateLink.style.display = updateInfo.newer ? "inline-block" : "none";
  }`, `    if (updateLink) updateLink.style.display = updateInfo.newer ? "inline-block" : "none";
    compactMenu?.refresh({
      running: state.running, busy: state.busy, connection: state.connection,
      harvested: state.harvested.toLocaleString("de-DE"),
      coins: state.coins.toLocaleString("de-DE"),
      coinsCompact: new Intl.NumberFormat("de-DE", {notation:"compact", maximumFractionDigits:1}).format(state.coins),
      sold: state.sold, runtime: formatTime(runtimeMs()), fields: selectedSlots().size + " / 200",
      produce: getProduce().length, delay: (prefs.adaptive ? state.currentDelay : cfg.adaptive.initialMs) + " ms",
      errors: state.errors, rejected: state.rejectedHarvests, protected: state.protectedSkips,
      update: updateInfo.newer
    });
  }`, 'live summary');
  return src;
};
