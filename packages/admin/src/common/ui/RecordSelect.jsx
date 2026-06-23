import { RecordSelect as BaseRecordSelect } from '../lib/ui/RecordSelect/RecordSelect';
import BackendHostURLState from '../stores/BackendHostURLState.js';
import UserState from '../stores/UserState.js';

export default function RecordSelect(props) {
  const { backendHost } = BackendHostURLState();
  const { user, setUser } = UserState();
  return <BaseRecordSelect backendHost={backendHost} user={user} setUser={setUser} {...props} />;
}
