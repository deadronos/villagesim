"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

import styles from "../styles/Town.module.css";
import type { SessionUser } from "../lib/session";

interface LoginProps {
  currentTownId?: string;
  isLoading?: boolean;
  onEnterTown?: (townId: string) => void;
  sessionUser?: SessionUser | null;
}

const normalizeTownId = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "starter-hollow";

export default function Login({ currentTownId, isLoading = false, onEnterTown, sessionUser }: LoginProps) {
  const [draftTownId, setDraftTownId] = useState(currentTownId ?? "starter-hollow");

  useEffect(() => {
    setDraftTownId(currentTownId ?? "starter-hollow");
  }, [currentTownId]);

  const normalizedTownId = useMemo(() => normalizeTownId(draftTownId), [draftTownId]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onEnterTown?.(normalizedTownId);
  };

  return (
    <section className={`${styles.panel} ${styles.loginPanel}`}>
      <p className={styles.eyebrow}>Local-first starter</p>
      <h2 className={styles.panelTitle}>Boot a demo town in seconds</h2>
      <p className={styles.helperText}>
        Start with a seeded village generated from the town id in the URL. It keeps the onboarding
        story lightweight while the real backend, sync, and auth layers come online.
      </p>

      <div className={styles.loginControls}>
        <button
          className={styles.button}
          disabled={isLoading}
          onClick={() => onEnterTown?.(normalizeTownId(currentTownId || draftTownId))}
          type="button"
        >
          {isLoading ? "Loading town…" : "Enter local demo"}
        </button>
        <span className={styles.seedPill}>Seed: {normalizeTownId(currentTownId || draftTownId)}</span>
      </div>

      <form className={styles.loginForm} onSubmit={handleSubmit}>
        <label className={styles.fieldLabel} htmlFor="town-id-input">
          Try another town seed
        </label>
        <div className={styles.inlineField}>
          <input
            className={styles.input}
            id="town-id-input"
            onChange={(event) => setDraftTownId(event.target.value)}
            placeholder="starter-hollow"
            type="text"
            value={draftTownId}
          />
          <button className={styles.buttonGhost} disabled={isLoading} type="submit">
            Load seed
          </button>
        </div>
      </form>

      <div className={styles.githubPlaceholder}>
        {sessionUser ? (
          <>
            <div>
              <h3 className={styles.placeholderTitle}>Signed in as @{sessionUser.login}</h3>
              <p className={styles.helperText}>
                {sessionUser.name ? `${sessionUser.name} · ` : ""}Your town is tied to this GitHub identity.
              </p>
            </div>
            <form action="/api/auth/logout" method="POST">
              <button className={styles.buttonGhost} type="submit">
                Sign out
              </button>
            </form>
          </>
        ) : (
          <>
            <div>
              <h3 className={styles.placeholderTitle}>GitHub sign-in</h3>
              <p className={styles.helperText}>
                Sign in with GitHub to open your hosted town. Your town is seeded from your GitHub profile.
              </p>
            </div>
            <a className={styles.button} href="/api/auth/start">
              Connect GitHub
            </a>
          </>
        )}
      </div>
    </section>
  );
}
