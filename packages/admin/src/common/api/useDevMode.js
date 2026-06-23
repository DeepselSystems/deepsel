import { useLocation } from 'react-router-dom';

export default function useDevMode() {
  const location = useLocation();
  const queryString = new URLSearchParams(location.search);
  const dev = queryString.get('dev');
  return dev === 'true' || dev === '1';
}
