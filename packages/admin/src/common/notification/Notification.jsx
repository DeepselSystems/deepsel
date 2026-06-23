import { useTranslation } from 'react-i18next';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import NotificationState from '../stores/NotificationState.js';
export default function Notification() {
  const { t } = useTranslation();
  const { open, setOpen, message, type, duration } = NotificationState((state) => state);
  return (
    <Snackbar
      anchorOrigin={{
        vertical: 'top',
        horizontal: 'right',
      }}
      open={open}
      autoHideDuration={duration || 3000}
      onClose={() => setOpen(!open)}
    >
      <Alert
        severity={type}
        sx={{
          width: '100%',
        }}
      >
        {t(message)}
      </Alert>
    </Snackbar>
  );
}
