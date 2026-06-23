import { RecordSelectMulti as BaseRecordSelectMulti } from '../lib/ui/RecordSelectMulti/RecordSelectMulti';
import BackendHostURLState from '../stores/BackendHostURLState.js';
import UserState from '../stores/UserState.js';

export default function RecordSelectMulti(props) {
  const { backendHost } = BackendHostURLState();
  const { user, setUser } = UserState();
  return (
    <BaseRecordSelectMulti backendHost={backendHost} user={user} setUser={setUser} {...props} />
  );
}
