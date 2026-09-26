'use client';
import { useEffect, useState } from 'react';

// Known defect: the main copy only exists after JavaScript runs.
export default function ClientContent() {
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState('');
  useEffect(() => { setReady(true); setNow(new Date().toISOString()); }, []);
  if (!ready) return <main />;
  return (
    <main>
      <h1>Fixture Co builds fast websites</h1>
      <p>We design, build and run marketing websites for growing companies. Our team ships Next.js sites on Cloudflare, tuned for search engines and AI assistants alike.</p>
      <p>Clients come to us when their site is slow, hard to find, or hard to change. We audit what is there, fix what matters most, and prove every change with numbers.</p>
      <h2>What we do</h2>
      <p>Strategy, design, engineering and ongoing care for websites that need to perform. Every project starts with a measured baseline and ends with a faster, clearer site.</p>
      <p>Rendered at <span id="clock">{now}</span></p>
    </main>
  );
}
