"use client";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="error-page">
      <section>
        <h1>Ceregium could not load this view.</h1>
        <p>Your saved data was not changed. Try loading the view again.</p>
        <button className="primary-button" onClick={reset}>Try again</button>
      </section>
    </main>
  );
}
