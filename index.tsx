import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

import { initMetaToken } from './services/metaAds';

// Initialize Meta Token from DB before rendering
initMetaToken();

const root = createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
