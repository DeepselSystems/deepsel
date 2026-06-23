import { useState, useEffect } from 'react';
import BackendHostURLState from '../stores/BackendHostURLState.js';
import i18n from 'i18next';

export default function ServerComponent({ name }) {
  const [Cmp, setCmp] = useState(null);
  const currentLang = i18n.language;
  const backendHost = BackendHostURLState((state) => state.backendHost);

  useEffect(() => {
    import(/* @vite-ignore */ `${backendHost}/template/jsx/${currentLang}/${name}`).then((m) =>
      setCmp(() => m.default),
    );
  }, [name, currentLang, backendHost]);

  return Cmp ? <Cmp /> : <div></div>;
}
