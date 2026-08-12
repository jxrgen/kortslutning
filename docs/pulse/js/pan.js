/**
 * Two-finger pan over any overflow surface.
 * One finger keeps tapping knobs/steps; two fingers drag the view.
 */

function canScroll(el) {
  if (!el || el === document.body || el === document.documentElement) return false;
  const style = getComputedStyle(el);
  const ox = style.overflowX;
  const oy = style.overflowY;
  const allowX = ox === "auto" || ox === "scroll" || ox === "overlay";
  const allowY = oy === "auto" || oy === "scroll" || oy === "overlay";
  const scrollableX = allowX && el.scrollWidth > el.clientWidth + 1;
  const scrollableY = allowY && el.scrollHeight > el.clientHeight + 1;
  return scrollableX || scrollableY;
}

function isPanSurface(el) {
  if (!el || !(el instanceof Element)) return false;
  if (el.classList.contains("pan")) return true;
  return canScroll(el);
}

function findScrollParent(node) {
  let el = node instanceof Element ? node : null;
  while (el) {
    if (isPanSurface(el)) return el;
    el = el.parentElement;
  }
  return document.querySelector(".workspace") || document.getElementById("app");
}

function applyPan(startEl, dx, dy) {
  let remainX = -dx;
  let remainY = -dy;
  let moved = false;
  let el = startEl;
  while (el && (Math.abs(remainX) > 0.5 || Math.abs(remainY) > 0.5)) {
    if (isPanSurface(el) || canScroll(el)) {
      const beforeL = el.scrollLeft;
      const beforeT = el.scrollTop;
      el.scrollLeft += remainX;
      el.scrollTop += remainY;
      const usedX = el.scrollLeft - beforeL;
      const usedY = el.scrollTop - beforeT;
      if (usedX || usedY) moved = true;
      remainX -= usedX;
      remainY -= usedY;
    }
    el = el.parentElement;
  }
  return moved;
}

function midpoint(touches) {
  const a = touches[0];
  const b = touches[1];
  return {
    x: (a.clientX + b.clientX) / 2,
    y: (a.clientY + b.clientY) / 2,
  };
}

export function installTwoFingerPan(root = document) {
  let state = null;

  const onStart = (e) => {
    if (e.touches.length !== 2) {
      if (e.touches.length < 2) state = null;
      return;
    }
    const mid = midpoint(e.touches);
    const hit = document.elementFromPoint(mid.x, mid.y);
    state = {
      target: findScrollParent(hit),
      x: mid.x,
      y: mid.y,
    };
  };

  const onMove = (e) => {
    if (e.touches.length !== 2 || !state?.target) return;
    const mid = midpoint(e.touches);
    const dx = mid.x - state.x;
    const dy = mid.y - state.y;
    state.x = mid.x;
    state.y = mid.y;
    if (applyPan(state.target, dx, dy)) {
      e.preventDefault();
    }
  };

  const onEnd = (e) => {
    if (e.touches.length < 2) state = null;
  };

  root.addEventListener("touchstart", onStart, { passive: true, capture: true });
  root.addEventListener("touchmove", onMove, { passive: false, capture: true });
  root.addEventListener("touchend", onEnd, { passive: true, capture: true });
  root.addEventListener("touchcancel", onEnd, { passive: true, capture: true });
}
