import { createContext, useContext } from 'react';

// Default: API key mode (backward compatible)
const defaultConfig = {
  mode: 'api_key', // 'api_key' | 'oauth'
  provider: 'openrouter',
  oauthCallbackPath: '/openrouter-callback',
};

const AIProviderConfigContext = createContext(defaultConfig);

export const AIProviderConfigProvider = AIProviderConfigContext.Provider;
export const useAIProviderConfig = () => useContext(AIProviderConfigContext);
export default AIProviderConfigContext;
