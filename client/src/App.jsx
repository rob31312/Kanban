import React from 'react';

function App() {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#111827',
        color: '#f9fafb',
        padding: '24px',
        fontFamily: 'Arial, sans-serif',
      }}
    >
      <h1>Static Discord Test</h1>
      <p>If you can see this inside Discord, the white screen is caused by Discord SDK initialization or another runtime path, not Cloudflare Pages itself.</p>
    </div>
  );
}

export default App;