/**
 * device.js — device/breakpoint detection utilities
 */

const MOBILE_BREAKPOINT = 768;

/**
 * Returns true if the viewport is in mobile range (<= 768px).
 * @returns {boolean}
 */
export function isMobile() {
  return window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches;
}

/**
 * Returns true if the device supports touch input.
 * @returns {boolean}
 */
export function isTouch() {
  return navigator.maxTouchPoints > 0;
}

/**
 * Subscribe to breakpoint changes.
 * @param {(isMobile: boolean) => void} cb
 * @returns {() => void} unsubscribe function
 */
export function onBreakpointChange(cb) {
  const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
  const handler = (e) => cb(e.matches);
  mq.addEventListener('change', handler);
  return () => mq.removeEventListener('change', handler);
}
