import { createContext, useContext } from 'react';

const BasenameContext = createContext('/admin');

export const BasenameProvider = BasenameContext.Provider;
export const useBasename = () => useContext(BasenameContext);
