/**
 * Light client-side source deterrents (not real security).
 * Prevents casual right-click / common inspect shortcuts.
 */
(function () {
  "use strict";
  const block = (e) => {
    e.preventDefault();
    return false;
  };
  document.addEventListener("contextmenu", block, { capture: true });
  document.addEventListener(
    "keydown",
    (e) => {
      const k = e.key || "";
      const key = k.length === 1 ? k.toLowerCase() : k;
      if (
        k === "F12" ||
        (e.ctrlKey && e.shiftKey && ["i", "j", "c", "k"].includes(key)) ||
        (e.ctrlKey && key === "u") ||
        (e.metaKey && e.altKey && ["i", "j", "c"].includes(key))
      ) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    },
    true
  );
  // Discourage drag-select of whole page source-ish content
  document.addEventListener("dragstart", block, { capture: true });
})();
