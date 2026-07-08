import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Notifications, notifications } from '@mantine/notifications';
import { IconCheck, IconX, IconAlertTriangle, IconInfoCircle } from '@tabler/icons-react';
import NotificationState from '../stores/NotificationState.js';

const typeProps = {
  success: { color: 'green', icon: <IconCheck size={18} /> },
  error: { color: 'red', icon: <IconX size={18} /> },
  warning: { color: 'yellow', icon: <IconAlertTriangle size={18} /> },
  info: { color: 'blue', icon: <IconInfoCircle size={18} /> },
};

export default function Notification() {
  const { t } = useTranslation();
  const { open, setOpen, message, type, duration } = NotificationState((state) => state);

  useEffect(() => {
    if (!open) return;
    notifications.show({
      message: t(message),
      autoClose: duration || 3000,
      ...(typeProps[type] || typeProps.info),
    });
    setOpen(false);
  }, [open]);

  return <Notifications position="top-right" />;
}
