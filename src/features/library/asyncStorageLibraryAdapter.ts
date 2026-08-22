import AsyncStorage from '@react-native-async-storage/async-storage';

import { type KeyValueAdapter } from './libraryRepository';

/** The storage seam only; validation and document behavior stay in the repository. */
export const asyncStorageLibraryAdapter: KeyValueAdapter = {
  get: (key) => AsyncStorage.getItem(key),
  set: (key, value) => AsyncStorage.setItem(key, value),
};
