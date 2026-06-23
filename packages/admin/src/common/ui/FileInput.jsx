import { FileInput as BaseFileInput } from '../lib/ui/FileInput/FileInput';
import BackendHostURLState from '../stores/BackendHostURLState.js';
import UserState from '../stores/UserState.js';

/**
 * File input component
 *
 * @param {import('../lib/ui/FileInput/FileInput.js').FileInputProps} props
 * @returns {JSX.Element}
 * @constructor
 */
export default function FileInput(props) {
  const { backendHost } = BackendHostURLState();
  const { user, setUser } = UserState();
  return <BaseFileInput backendHost={backendHost} user={user} setUser={setUser} {...props} />;
}
