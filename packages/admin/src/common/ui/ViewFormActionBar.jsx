import { ViewFormActionBar as BaseViewFormActionBar } from '../lib/ui/ViewFormActionBar/ViewFormActionBar';
import UserState from '../stores/UserState.js';
import NotificationState from '../stores/NotificationState.js';

export default function ViewFormActionBar(props) {
  const { user } = UserState();
  const { notify } = NotificationState();
  return <BaseViewFormActionBar user={user} notify={notify} {...props} />;
}
