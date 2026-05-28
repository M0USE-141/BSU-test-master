/**
 * state.js — minimal central store
 * Simple event-emitter + immutable-patch state object.
 *
 * Usage:
 *   import { getState, setState, subscribe, dispatch } from './state.js';
 *
 *   subscribe('user', (user) => console.log('user changed', user));
 *   setState({ user: { id: 1, username: 'alice' } });
 *   dispatch('LOGOUT', null);
 */

/** @type {Record<string, any>} */
let _state = {
  user:        null,   // null | { id, username, email, avatar_url, ... }
  theme:       'light',
  accent:      'green',
  locale:      'ru',
  isLoading:   false,
  error:       null,
  // routing
  route:       '',
  routeParams: {},
};

/** @type {Map<string, Set<Function>>} */
const _listeners = new Map();

/** @type {Map<string, Set<Function>>} */
const _actionHandlers = new Map();

/**
 * Get a snapshot of the current state (shallow copy).
 * @returns {typeof _state}
 */
export function getState() {
  return { ..._state };
}

/**
 * Merge a patch into the state and notify subscribers for changed keys.
 * @param {Partial<typeof _state>} patch
 */
export function setState(patch) {
  const changed = [];
  for (const [key, value] of Object.entries(patch)) {
    if (_state[key] !== value) {
      _state[key] = value;
      changed.push(key);
    }
  }
  for (const key of changed) {
    const subs = _listeners.get(key);
    if (subs) {
      for (const cb of subs) {
        try { cb(_state[key], _state); }
        catch (e) { console.error('[state] subscriber error:', e); }
      }
    }
    // Wildcard listeners
    const all = _listeners.get('*');
    if (all) {
      for (const cb of all) {
        try { cb(key, _state[key], _state); }
        catch (e) { console.error('[state] wildcard subscriber error:', e); }
      }
    }
  }
}

/**
 * Subscribe to state changes on a specific key.
 * Pass '*' to listen to all changes.
 * @param {string} key
 * @param {Function} cb
 * @returns {() => void} unsubscribe function
 */
export function subscribe(key, cb) {
  if (!_listeners.has(key)) _listeners.set(key, new Set());
  _listeners.get(key).add(cb);
  return () => _listeners.get(key)?.delete(cb);
}

/**
 * Register a handler for a named action.
 * @param {string} action
 * @param {Function} handler
 */
export function on(action, handler) {
  if (!_actionHandlers.has(action)) _actionHandlers.set(action, new Set());
  _actionHandlers.get(action).add(handler);
}

/**
 * Dispatch a named action to all registered handlers.
 * @param {string} action
 * @param {any} payload
 */
export function dispatch(action, payload) {
  const handlers = _actionHandlers.get(action);
  if (handlers) {
    for (const h of handlers) {
      try { h(payload, _state); }
      catch (e) { console.error(`[state] action handler error (${action}):`, e); }
    }
  }
}
