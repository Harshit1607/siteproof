import ClientContent from './client-content';

export default function Home() {
  return (
    <>
      {/* Known defect: invalid JSON-LD (trailing comma, no @context). */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: '{ "@type": "Organization", "name": "Fixture Co", }' }} />
      {/* Known defects: unoptimised 1600px PNG hero, no next/image, no alt, no dimensions. */}
      <img className="hero" src="/hero.png" />
      <ClientContent />
    </>
  );
}
