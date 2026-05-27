/**
 * components/avatar-crop.js — client-side square crop modal.
 *
 * Use:
 *   const blob = await openAvatarCrop(file);   // null if user cancels
 *   if (blob) await uploadAvatar(new File([blob], 'avatar.png', {type:'image/png'}));
 *
 * Implementation: HTMLCanvasElement + drag-to-pan + slider for zoom.
 * No image library — square output baked into a PNG Blob at the
 * configured pixel size (default 512). Avatars in TestMaster are
 * displayed at 28–80px so 512 is more than enough.
 *
 * The modal locks aspect ratio to 1:1 — matches the round avatar
 * rendering at .avatar (border-radius: 50%).
 */
import { iconEl } from '../icons.js';
import { t } from '../utils/locale.js';

const OUTPUT_SIZE = 512;       // px — square PNG output
const VIEWPORT    = 280;       // px — modal canvas size (square)

/**
 * Open the crop modal for the given file.
 * @param {File} file
 * @returns {Promise<Blob|null>} cropped PNG blob, or null when cancelled
 */
export function openAvatarCrop(file) {
  return new Promise(function (resolve) {
    loadImage(file).then(function (img) {
      buildModal(img, resolve);
    }).catch(function () {
      resolve(null);
    });
  });
}

function loadImage(file) {
  return new Promise(function (resolve, reject) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = function () {
      // Don't revoke immediately — drawImage may still hold a reference
      // on some browsers; revoke from the close path instead.
      img.__url = url;
      resolve(img);
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      reject(new Error('Bad image'));
    };
    img.src = url;
  });
}

function buildModal(img, done) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.maxWidth = '380px';
  modal.style.padding = 'var(--sp-4) var(--sp-4) var(--sp-3)';

  const head = document.createElement('div');
  head.style.display = 'flex';
  head.style.alignItems = 'center';
  head.style.justifyContent = 'space-between';
  head.style.marginBottom = 'var(--sp-3)';
  const title = document.createElement('div');
  title.style.fontSize = 'var(--fs-lg)';
  title.style.fontWeight = 'var(--fw-bold)';
  title.textContent = 'Обрезать фото';
  head.appendChild(title);

  const xBtn = document.createElement('button');
  xBtn.type = 'button';
  xBtn.className = 'btn--icon';
  xBtn.setAttribute('aria-label', 'Закрыть');
  xBtn.appendChild(iconEl('x', 14));
  xBtn.addEventListener('click', function () { close(null); });
  head.appendChild(xBtn);

  modal.appendChild(head);

  // Canvas viewport.
  const canvas = document.createElement('canvas');
  canvas.width = VIEWPORT;
  canvas.height = VIEWPORT;
  canvas.style.display = 'block';
  canvas.style.margin = '0 auto';
  canvas.style.borderRadius = '50%';
  canvas.style.border = '1.5px solid var(--ink)';
  canvas.style.background = 'var(--ink-soft)';
  canvas.style.cursor = 'grab';
  modal.appendChild(canvas);

  // Zoom slider.
  const sliderRow = document.createElement('div');
  sliderRow.style.display = 'flex';
  sliderRow.style.alignItems = 'center';
  sliderRow.style.gap = '8px';
  sliderRow.style.marginTop = 'var(--sp-3)';
  const minusIcon = document.createElement('span');
  minusIcon.style.fontSize = '12px';
  minusIcon.style.color = 'var(--ink-tertiary)';
  minusIcon.textContent = '−';
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '1';
  slider.max = '4';
  slider.step = '0.01';
  slider.value = '1';
  slider.style.flex = '1';
  slider.style.accentColor = 'var(--accent)';
  const plusIcon = document.createElement('span');
  plusIcon.style.fontSize = '14px';
  plusIcon.style.color = 'var(--ink-tertiary)';
  plusIcon.textContent = '+';
  sliderRow.appendChild(minusIcon);
  sliderRow.appendChild(slider);
  sliderRow.appendChild(plusIcon);
  modal.appendChild(sliderRow);

  // Hint.
  const hint = document.createElement('div');
  hint.style.fontSize = 'var(--fs-xs)';
  hint.style.color = 'var(--ink-tertiary)';
  hint.style.textAlign = 'center';
  hint.style.marginTop = '6px';
  hint.textContent = 'Перетащите изображение, чтобы выбрать область';
  modal.appendChild(hint);

  // Buttons.
  const btnRow = document.createElement('div');
  btnRow.style.display = 'flex';
  btnRow.style.gap = 'var(--sp-2)';
  btnRow.style.marginTop = 'var(--sp-4)';
  btnRow.style.justifyContent = 'flex-end';

  const cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn';
  cancelBtn.textContent = t('common.cancel') || 'Отмена';
  cancelBtn.addEventListener('click', function () { close(null); });
  btnRow.appendChild(cancelBtn);

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn btn--primary';
  saveBtn.textContent = 'Сохранить';
  btnRow.appendChild(saveBtn);

  modal.appendChild(btnRow);
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  // ── Crop state ────────────────────────────────────────────
  // We display `img` scaled to "fit" the VIEWPORT initially (so the
  // shorter side equals VIEWPORT). zoom multiplies that base scale.
  // (ox, oy) is the image-space top-left of the visible viewport in
  // image pixels; we clamp panning so the image never reveals empty
  // canvas.
  const baseScale = Math.max(VIEWPORT / img.width, VIEWPORT / img.height);
  const state = {
    zoom: 1,
    ox: (img.width  - VIEWPORT / baseScale) / 2,
    oy: (img.height - VIEWPORT / baseScale) / 2,
  };

  const ctx = canvas.getContext('2d');

  function paint() {
    const scale = baseScale * state.zoom;
    // Source rect in image pixels = visible viewport, sized for the
    // current zoom level.
    const srcW = VIEWPORT / scale;
    const srcH = VIEWPORT / scale;
    state.ox = clamp(state.ox, 0, Math.max(0, img.width  - srcW));
    state.oy = clamp(state.oy, 0, Math.max(0, img.height - srcH));
    ctx.clearRect(0, 0, VIEWPORT, VIEWPORT);
    ctx.drawImage(img, state.ox, state.oy, srcW, srcH, 0, 0, VIEWPORT, VIEWPORT);
  }
  paint();

  // Drag-to-pan.
  let dragging = false, lastX = 0, lastY = 0;
  canvas.addEventListener('mousedown', function (e) {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.style.cursor = 'grabbing';
  });
  window.addEventListener('mousemove', function (e) {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    const scale = baseScale * state.zoom;
    state.ox -= dx / scale;
    state.oy -= dy / scale;
    paint();
  });
  window.addEventListener('mouseup', function () {
    dragging = false;
    canvas.style.cursor = 'grab';
  });

  // Zoom slider — anchor zoom at the canvas centre so the user's
  // current view doesn't jump.
  slider.addEventListener('input', function () {
    const newZoom = parseFloat(slider.value);
    const oldScale = baseScale * state.zoom;
    const newScale = baseScale * newZoom;
    // Image-space centre of viewport before change.
    const cx = state.ox + (VIEWPORT / 2) / oldScale;
    const cy = state.oy + (VIEWPORT / 2) / oldScale;
    // Re-anchor.
    state.zoom = newZoom;
    state.ox = cx - (VIEWPORT / 2) / newScale;
    state.oy = cy - (VIEWPORT / 2) / newScale;
    paint();
  });

  // Save → bake square PNG.
  saveBtn.addEventListener('click', function () {
    const out = document.createElement('canvas');
    out.width = OUTPUT_SIZE;
    out.height = OUTPUT_SIZE;
    const octx = out.getContext('2d');
    const scale = baseScale * state.zoom;
    const srcW = VIEWPORT / scale;
    const srcH = VIEWPORT / scale;
    octx.drawImage(img, state.ox, state.oy, srcW, srcH, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    out.toBlob(function (blob) {
      close(blob);
    }, 'image/png', 0.95);
  });

  backdrop.addEventListener('click', function (e) {
    if (e.target === backdrop) close(null);
  });

  function close(result) {
    backdrop.remove();
    if (img.__url) URL.revokeObjectURL(img.__url);
    done(result);
  }
}

function clamp(v, lo, hi) {
  if (hi < lo) return lo;
  return Math.max(lo, Math.min(hi, v));
}
