/**
 * mobile/errors/404.js — Mobile "page not found" page.
 *
 * Reached when the SPA navigates to `/error/404` or no route matches.
 * Simple message + "На главную" primary action.
 */
import { navigate } from '../../../router.js';
import { t } from '../../../utils/locale.js';
import { buildErrorScreen } from './_err-shell.js';

export default async function render(root) {
  buildErrorScreen({
    root,
    code: '404',
    iconName: 'search',
    iconBg: 'var(--ink-soft)',
    iconColor: 'var(--ink-fade)',
    title:   t('error.404.title')   || 'Страница не найдена',
    message: t('error.404.message') || 'Возможно, тест был удалён или ссылка устарела.',
    primary: {
      label: t('common.home') || 'На главную',
      onClick: () => navigate('/home'),
    },
  });
}
