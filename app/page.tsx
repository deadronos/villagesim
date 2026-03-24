import type { Metadata } from "next";
import Link from "next/link";

import styles from "../styles/Home.module.css";

const starterSteps = [
  "Copy .env.example to .env.local and keep MODEL_MOCK=true for a local-first first run.",
  "Install dependencies, then start the Next.js shell with npm run dev.",
  "Use the demo town route as the handoff target for the town renderer and backend tracks.",
];

export const metadata: Metadata = {
  title: "VillageSim Starter",
  description: "Local-first VillageSim starter scaffold built with Next.js, React, and TypeScript.",
};

export default function HomePage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>VillageSim starter</p>
        <h1 className={styles.title}>A minimal local-first app shell for the VillageSim MVP.</h1>
        <p className={styles.description}>
          This scaffold wires up the Next.js + React + TypeScript foundation so the UI, backend,
          and worker tracks can land on a runnable base without revisiting project setup.
        </p>

        <div className={styles.actions}>
          <Link className={styles.primaryAction} href="/town/demo-town">
            Open demo town target
          </Link>
          <a className={styles.secondaryAction} href="https://nextjs.org/docs" rel="noopener noreferrer" target="_blank">
            Next.js docs
          </a>
        </div>
      </section>

      <section className={styles.panel}>
        <h2>What is included</h2>
        <ul className={styles.list}>
          <li>Next.js App Router with global styling and a starter home screen.</li>
          <li>Baseline scripts for development, production build, runtime start, and linting.</li>
          <li>Mock-friendly environment defaults for local-first iteration before real services exist.</li>
        </ul>
      </section>

      <section className={styles.panel}>
        <h2>Recommended first run</h2>
        <ol className={styles.list}>
          {starterSteps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <p className={styles.note}>
          The <code>/town/demo-town</code> route now uses shared mock village state and can be
          advanced through the local tick API or worker script.
        </p>
      </section>
    </main>
  );
}
