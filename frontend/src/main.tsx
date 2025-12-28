import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import { suppressHarmlessErrors } from './utils/errorSuppression';

// Suppress harmless wallet extension conflicts
suppressHarmlessErrors();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

