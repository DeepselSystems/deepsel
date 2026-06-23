const DEFAULT_DEV_BACKEND = 'http://localhost:8000';
const DEFAULT_PROD_BACKEND = '';

const getInitialBackendHost = () => {
  // Check if window is defined (client-side) before accessing it
  const windowPublicBackend = typeof window !== 'undefined' ? window.PUBLIC_BACKEND : undefined;

  // Use ?? (nullish coalescing) so that empty string "" is preserved as a valid
  // relative-path value. With ||, "" would be falsy and fall through to defaults.
  const configuredBackend =
    import.meta.env.VITE_PUBLIC_BACKEND ?? import.meta.env.PUBLIC_BACKEND ?? windowPublicBackend;

  const source =
    import.meta.env.VITE_PUBLIC_BACKEND != null
      ? 'VITE_PUBLIC_BACKEND'
      : import.meta.env.PUBLIC_BACKEND != null
        ? 'PUBLIC_BACKEND'
        : windowPublicBackend != null
          ? 'window.PUBLIC_BACKEND'
          : 'default';

  let host =
    configuredBackend ?? (import.meta.env.DEV ? DEFAULT_DEV_BACKEND : DEFAULT_PROD_BACKEND);

  // Add /api/v1 suffix if not already present
  if (!host.endsWith('/api/v1')) {
    host = host.endsWith('/') ? host + 'api/v1' : host + '/api/v1';
  }

  return { host, source };
};

const checkBackendHealth = async (url) => {
  try {
    // Add /api/v1 suffix if not already present
    let healthUrl = url;
    if (!healthUrl.endsWith('/api/v1')) {
      healthUrl = healthUrl.endsWith('/') ? healthUrl + 'api/v1' : healthUrl + '/api/v1';
    }
    const response = await fetch(`${healthUrl}/util/health`);
    const data = await response.json();
    return data.status === 'ok';
  } catch (error) {
    console.log('Backend health check failed:', url);
    return false;
  }
};

const getPullRequestBackendHost = async () => {
  const deployBranch = import.meta.env.VITE_NETLIFY_BRANCH;
  const deployPullRequest = import.meta.env.VITE_NETLIFY_PULL_REQUEST;

  if (deployPullRequest !== 'true') return null;

  const backendSubdomain = deployBranch.replace('/', '-').toLowerCase();
  let prBackendHost = `https://${backendSubdomain}.deepsel.com`;

  const isHealthy = await checkBackendHealth(prBackendHost);
  if (isHealthy) {
    // Add /api/v1 suffix if not already present
    if (!prBackendHost.endsWith('/api/v1')) {
      prBackendHost = prBackendHost.endsWith('/')
        ? prBackendHost + 'api/v1'
        : prBackendHost + '/api/v1';
    }
    return prBackendHost;
  }
  return null;
};

const { host: initialHost, source } = getInitialBackendHost();
let backendHost = initialHost;

// Initialize PR backend host if applicable
getPullRequestBackendHost().then((prHost) => {
  if (prHost) {
    backendHost = prHost;
    console.log(`backendHost ${backendHost} (source: PR branch override)`);
  }
});
console.log(`backendHost ${backendHost} (source: ${source})`);
export default backendHost;
