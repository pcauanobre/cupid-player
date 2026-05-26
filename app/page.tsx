import Link from 'next/link';

export default function Home() {
  return (
    <main className="center-stack">
      <h1>cupid player</h1>
      <p>shared youtube music — admin plays on their device, listeners control the queue.</p>
      <div className="row">
        <Link href="/admin">admin</Link>
        <Link href="/user">user</Link>
      </div>
    </main>
  );
}
