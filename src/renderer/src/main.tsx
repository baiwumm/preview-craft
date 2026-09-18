import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';
import ExportPage from './components/ExportPage';

import './styles/index.css';

const isExportPage = window.location.hash.startsWith('#/export');

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {isExportPage ? <ExportPage /> : <App />}
  </React.StrictMode>
);
