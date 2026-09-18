import React from 'react';

export function App() {
  return (
    <div style={{ fontFamily: 'sans-serif', padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ borderBottom: '2px solid #e2e8f0', paddingBottom: '1rem', marginBottom: '2rem' }}>
        <h1 style={{ color: '#b91c1c', margin: 0 }}>MeshAid Emergency Incident Center</h1>
        <p style={{ color: '#4b5563', margin: '0.5rem 0 0 0' }}>
          Real-time incident feed synchronized from opportunistic mesh gateways. (ADROIT Non-AI Project)
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.5rem' }}>
        <div style={{ padding: '1.5rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px' }}>
          <h3 style={{ color: '#991b1b', marginTop: 0 }}>P0: Authority Alerts</h3>
          <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: '0.5rem 0', color: '#7f1d1d' }}>0</p>
          <span style={{ fontSize: '0.875rem', color: '#991b1b' }}>Official Evacuation Warnings</span>
        </div>

        <div style={{ padding: '1.5rem', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px' }}>
          <h3 style={{ color: '#c2410c', marginTop: 0 }}>P1: Civilian SOS</h3>
          <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: '0.5rem 0', color: '#9a3412' }}>0</p>
          <span style={{ fontSize: '0.875rem', color: '#c2410c' }}>Active Life Distress Signals</span>
        </div>

        <div style={{ padding: '1.5rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px' }}>
          <h3 style={{ color: '#15803d', marginTop: 0 }}>Active Gateways</h3>
          <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: '0.5rem 0', color: '#166534' }}>0</p>
          <span style={{ fontSize: '0.875rem', color: '#15803d' }}>Synchronizing Mesh Nodes</span>
        </div>
      </div>
    </div>
  );
}

export default App;
