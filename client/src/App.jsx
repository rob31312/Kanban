import React, { useEffect, useState } from 'react';
import { initializeDiscord } from './discord';

function App() {
  const [status, setStatus] = useState('Starting...');
  const [details, setDetails] = useState('No details yet.');

  useEffect(() => {
    async function run() {
      try {
        setStatus('Rendering worked');
        setDetails('App mounted successfully.');

        const result = await initializeDiscord();

        setStatus('Discord init returned');
        setDetails(JSON.stringify(result, null, 2));
      } catch (error) {
        setStatus('Discord init failed');
        setDetails(error?.stack || error?.message || String(error));
      }
    }

    run();
  }, []);

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
      <h1>Kanban Debug Screen</h1>
      <p><strong>Status:</strong> {status}</p>
      <pre
        style={{
          whiteSpace: 'pre-wrap',
          background: '#1f2937',
          padding: '16px',
          borderRadius: '8px',
          overflowWrap: 'anywhere',
        }}
      >
        {details}
      </pre>
    </div>
  );
}

export default App;