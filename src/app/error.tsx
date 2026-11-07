'use client';
export default function ErrorPage({ reset }: { reset: () => void }) { return <main id="main" className="narrow-page"><h1>We couldn’t open this page.</h1><p>The account service may be unavailable. Please try again shortly.</p><button className="button" onClick={reset}>Try again</button></main>; }
