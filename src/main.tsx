import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { IslandPage } from './IslandPage';
import './index.css';

// ?island=1 → la ventana compacta "isla dinámica" (creada por electron/main).
const isIsland = new URLSearchParams(window.location.search).get('island') === '1';

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        {isIsland ? <IslandPage /> : <App />}
    </React.StrictMode>
);
