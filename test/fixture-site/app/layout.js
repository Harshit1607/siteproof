import { Roboto } from 'next/font/google';
import './globals.css';

// Known defect: loads every weight, only 400 is used.
const roboto = Roboto({ subsets: ['latin'], weight: ['100', '300', '400', '500', '700', '900'], variable: '--font-roboto' });

// Known defect: no metadata (no title, no description) on the root layout.
export default function RootLayout({ children }) {
  return (
    <html lang="en" className={roboto.variable}>
      <body>
        <header>
          <nav>
            <a href="/">Home</a>
            <a href="/about">About</a>
            <a href="/blog/first-post">First post</a>
            <a href="/blog/second-post">Second post</a>
          </nav>
        </header>
        {children}
        <footer>© Fixture Co · <a href="/missing-page">Old link</a></footer>
      </body>
    </html>
  );
}
