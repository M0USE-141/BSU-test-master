/**
 * mobile/errors/403.js — Mobile "access denied" page.
 *
 * Reached when the SPA navigates to `/error/403`. Wires up the
 * request-access flow via `requestAccess(testId)` when the URL carries
 * `?testId=<id>` (the calling screen passes it along when redirecting).
 */
import { navigate } from '../../../router.js';
import { t } from '../../../utils/locale.js';
import { requestAccess } from '../../../api/access-requests.js';
import { toast } from '../../../components/toast.js';
import { buildErrorScreen } from './_err-shell.js';

export default async function render(root, params = {}) {
  const testId = params.testId || params.test_id;
  const opts = {
    root,
    code: '403',
    iconName: 'lock',
    iconBg: 'var(--warn-soft)',
    iconColor: '#8a6a17',
    title:   t('error.403.title')   || 'Этот тест приватный',
    message: t('error.403.message') || 'Автор открыл доступ только определённым пользователям. Можете запросить доступ — автор увидит запрос.',
    secondary: {
      label: '← ' + (t('common.home') || 'На главную'),
      onClick: () => navigate('/home'),
    },
  };

  if (testId) {
    opts.primary = {
      label: t('error.403.cta') || 'Запросить доступ',
      onClick: async () => {
        try {
          await requestAccess(testId);
          toast(t('error.403.toast') || 'Запрос отправлен', { tone: 'success' });
          navigate('/home');
        } catch (e) {
          toast(e?.message || 'Ошибка', { tone: 'error' });
        }
      },
    };
  }

  buildErrorScreen(opts);
}
