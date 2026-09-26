"use client";

// Rendering failed: say so plainly, with a way back. No details are shown.
export default function StoreError() {
  return (
    <main id="main" className="sv-container sv-section">
      <h1>Something went wrong</h1>
      <p>We couldn't show this page. Please try again in a moment.</p>
      <p>
        <a className="sv-button" href="/">
          Back to the home page
        </a>
      </p>
    </main>
  );
}
