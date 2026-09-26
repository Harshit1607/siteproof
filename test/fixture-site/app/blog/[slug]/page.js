const posts = {
  'first-post': { title: 'Why speed matters', body: 'A faster site keeps visitors reading. Every second of delay on mobile costs attention, and search engines notice too.' },
  'second-post': { title: 'Writing for AI search', body: 'AI assistants quote pages they can read without running JavaScript. Server-rendered content is the simplest way to be quotable.' },
};

export function generateStaticParams() {
  return Object.keys(posts).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  return { title: posts[slug].title, description: posts[slug].body.slice(0, 150) };
}

export default async function Post({ params }) {
  const { slug } = await params;
  const post = posts[slug];
  return (
    <main>
      <h1>{post.title}</h1>
      <p>{post.body}</p>
    </main>
  );
}
