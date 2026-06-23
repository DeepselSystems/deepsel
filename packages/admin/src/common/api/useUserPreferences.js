import useAuthentication from './useAuthentication.js';
import { useMemo } from 'react';
import useModel from './useModel.jsx';

// this is intended to read/sync a key in the `user.preferences` object, which is a json column in the database
// the key will be read, and synced if changed

export default function useUserPreferences(
  key,
  options = {
    defaultValue: null,
  },
) {
  const { user, saveUserData } = useAuthentication();
  const { update: updateUserOnServer } = useModel('user');

  const userPreferences = useMemo(() => {
    return user?.preferences;
  }, [user]);

  const currentValue = useMemo(() => {
    return userPreferences?.[key] ?? options.defaultValue;
  }, [userPreferences, key]);

  async function setValue(value) {
    if (!user) {
      console.error('User object is not loaded.');
      return;
    }

    const newUserData = {
      ...user,
      preferences: {
        ...user.preferences,
        [key]: value,
      },
    };

    await Promise.all([updateUserOnServer(newUserData), saveUserData(newUserData)]);
  }

  // sync

  return {
    value: currentValue,
    setValue,
  };
}
