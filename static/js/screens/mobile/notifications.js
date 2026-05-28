/**
 * screens/mobile/notifications.js — Mobile notifications screen
 * Stub — backend notifications endpoint is part of Phase 8 (MVP gap).
 */
import { t } from '../../utils/locale.js';
import { buildBottomNav, buildTopBar } from './_shell.js';

export default function render(root, params = {}) {
  const screen = document.createElement('div');
  screen.className = 'mob';
  screen.appendChild(buildTopBar({ title: t('nav.notifications') || 'Notifications' }));

  const content = document.createElement('div');
  content.className = 'mob__content';
  content.innerHTML = `
    <div class="mob-empty" style="margin-top:48px;">
      <div style="font-size:36px;margin-bottom:14px;line-height:1;">🔔</div>
      <div class="mob-empty__text">
        ${t('common.empty') || 'Nothing here yet'}
      </div>
      <div style="font:400 13px/1.5 Inter,sans-serif;color:var(--ink-mute);
                  margin-top:8px;max-width:220px;margin-left:auto;margin-right:auto;">
        Notifications will appear here when you receive them.
      </div>
    </div>`;

  screen.appendChild(content);
  screen.appendChild(buildBottomNav('me'));
  root.innerHTML = '';
  root.appendChild(screen);
}
