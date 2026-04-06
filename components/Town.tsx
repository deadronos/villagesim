"use client";

import { useMemo } from "react";

import styles from "../styles/Town.module.css";
import Login from "./Login";
import type { SessionUser } from "../lib/session";
import TownCanvas, { type TownData, type TownNpc } from "./TownCanvas";

interface TownProps {
  error?: string | null;
  isLoading?: boolean;
  onOpenTown?: (townId: string) => void;
  sessionTownId?: string | null;
  sessionUser?: SessionUser | null;
  town?: TownData | null;
  townId: string;
}

const defaultBars = {
  energy: 0,
  hunger: 0,
  social: 0,
};

const toPercent = (value?: number) => Math.max(0, Math.min(100, value ?? 0));

function summarizeActivities(npcs: TownNpc[] = []) {
  const counts = new Map<string, number>();

  npcs.forEach((npc) => {
    const key = npc.currentAction?.trim() || "idle";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([label, count]) => ({
      count,
      label,
    }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 4);
}

function summarizeBars(npcs: TownNpc[] = []) {
  if (!npcs.length) {
    return defaultBars;
  }

  const totals = npcs.reduce(
    (accumulator, npc) => ({
      energy: accumulator.energy + toPercent(npc.energy),
      hunger: accumulator.hunger + toPercent(npc.hunger),
      social: accumulator.social + toPercent(npc.social),
    }),
    defaultBars,
  );

  return {
    energy: Math.round(totals.energy / npcs.length),
    hunger: Math.round(totals.hunger / npcs.length),
    social: Math.round(totals.social / npcs.length),
  };
}

export default function Town({ error, isLoading = false, onOpenTown, sessionTownId, sessionUser, town, townId }: TownProps) {
  const activitySummary = useMemo(() => summarizeActivities(town?.npcs), [town?.npcs]);
  const barSummary = useMemo(() => summarizeBars(town?.npcs), [town?.npcs]);
  const activityFeed = town?.activityFeed ?? [];
  const notes = town?.notes ?? [];
  const roster = town?.npcs ?? [];

  const hasTown = Boolean(town);
  const hasNpcs = Boolean(town?.npcs?.length);

  return (
    <div className={styles.container}>
      <header className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>VillageSim demo</p>
          <h1 className={styles.title}>{town?.name ?? "Seeded starter town"}</h1>
          <p className={styles.subtitle}>
            {town?.description ??
              "A tiny, local-first village view for browsing NPC state before realtime sync is wired in."}
          </p>
          <div className={styles.tagList}>
            <span className={styles.tag}>Town id: {townId}</span>
            <span className={styles.tag}>Seed: {town?.seedLabel ?? townId}</span>
            <span className={styles.tag}>{town?.timeOfDay ?? "Morning tick"}</span>
            <span className={styles.tag}>{town?.weather ?? "Clear skies"}</span>
          </div>
        </div>

        <Login
          currentTownId={townId}
          isLoading={isLoading}
          onEnterTown={onOpenTown}
          sessionTownId={sessionTownId}
          sessionUser={sessionUser}
        />
      </header>

      {isLoading ? (
        <section className={`${styles.panel} ${styles.loadingState}`}>
          <h2 className={styles.panelTitle}>Loading seeded town…</h2>
          <p className={styles.helperText}>Preparing the local map, villagers, and starter summaries.</p>
        </section>
      ) : null}

      {!isLoading && error ? (
        <section className={`${styles.panel} ${styles.emptyState}`}>
          <h2 className={styles.panelTitle}>Town data is unavailable</h2>
          <p className={styles.helperText}>{error}</p>
        </section>
      ) : null}

      {!isLoading && !error && !hasTown ? (
        <section className={`${styles.panel} ${styles.emptyState}`}>
          <h2 className={styles.panelTitle}>No town loaded yet</h2>
          <p className={styles.helperText}>
            Use the demo starter above to generate a local village seed and inspect the NPC roster.
          </p>
        </section>
      ) : null}

      {!isLoading && !error && hasTown ? (
        <div className={styles.layout}>
          <section className={`${styles.panel} ${styles.canvasCard}`}>
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.eyebrow}>Town map</p>
                <h2 className={styles.panelTitle}>Pixel village snapshot</h2>
              </div>
              <span className={styles.badge}>{town?.npcs?.length ?? 0} villagers</span>
            </div>

            <div className={styles.canvasFrame}>
              <TownCanvas className={styles.canvas} town={town} />
            </div>

            <p className={styles.canvasHint}>
              Homes, fields, paths, and water are drawn as a tiny starter map so the UI stays useful
              even before animated movement is added.
            </p>

            <ul className={styles.legend}>
              <li className={styles.legendItem}>
                <span className={`${styles.legendSwatch} ${styles.legendGrass}`} /> Grass
              </li>
              <li className={styles.legendItem}>
                <span className={`${styles.legendSwatch} ${styles.legendPath}`} /> Path
              </li>
              <li className={styles.legendItem}>
                <span className={`${styles.legendSwatch} ${styles.legendWater}`} /> Water
              </li>
              <li className={styles.legendItem}>
                <span className={`${styles.legendSwatch} ${styles.legendHome}`} /> Home
              </li>
              <li className={styles.legendItem}>
                <span className={`${styles.legendSwatch} ${styles.legendField}`} /> Field
              </li>
            </ul>
          </section>

          <aside className={styles.aside}>
            <section className={styles.summaryGrid}>
              {activitySummary.length ? (
                activitySummary.map((item) => (
                  <article className={styles.summaryCard} key={item.label}>
                    <span className={styles.summaryValue}>{item.count}</span>
                    <span className={styles.summaryLabel}>{item.label}</span>
                  </article>
                ))
              ) : (
                <article className={styles.summaryCard}>
                  <span className={styles.summaryValue}>0</span>
                  <span className={styles.summaryLabel}>No activity yet</span>
                </article>
              )}
            </section>

            <section className={styles.panel}>
              <div className={styles.sectionHeading}>
                <div>
                  <p className={styles.eyebrow}>Population mood</p>
                  <h2 className={styles.panelTitle}>Quick stats</h2>
                </div>
              </div>
              <div className={styles.statBars}>
                <div className={styles.statRow}>
                  <span className={styles.statLabel}>Energy</span>
                  <div className={styles.statTrack}>
                    <div className={`${styles.statFill} ${styles.energyFill}`} style={{ width: `${barSummary.energy}%` }} />
                  </div>
                  <span className={styles.muted}>{barSummary.energy}%</span>
                </div>
                <div className={styles.statRow}>
                  <span className={styles.statLabel}>Hunger</span>
                  <div className={styles.statTrack}>
                    <div className={`${styles.statFill} ${styles.hungerFill}`} style={{ width: `${barSummary.hunger}%` }} />
                  </div>
                  <span className={styles.muted}>{barSummary.hunger}%</span>
                </div>
                <div className={styles.statRow}>
                  <span className={styles.statLabel}>Social</span>
                  <div className={styles.statTrack}>
                    <div className={`${styles.statFill} ${styles.socialFill}`} style={{ width: `${barSummary.social}%` }} />
                  </div>
                  <span className={styles.muted}>{barSummary.social}%</span>
                </div>
              </div>
            </section>

            <section className={styles.panel}>
              <div className={styles.sectionHeading}>
                <div>
                  <p className={styles.eyebrow}>Activity feed</p>
                  <h2 className={styles.panelTitle}>Starter summaries</h2>
                </div>
              </div>
              <ul className={styles.feedList}>
                {activityFeed.length ? (
                  activityFeed.map((event) => (
                    <li className={styles.feedItem} key={event.id}>
                      <span className={`${styles.feedTone} ${styles[`feedTone${event.tone === "good" ? "Good" : event.tone === "alert" ? "Alert" : "Neutral"}`]}`} />
                      <span>{event.label}</span>
                    </li>
                  ))
                ) : (
                  <li className={styles.feedItem}>No local activity summaries yet.</li>
                )}
              </ul>
            </section>
          </aside>

          <section className={`${styles.panel} ${styles.roster}`}>
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.eyebrow}>NPC state</p>
                <h2 className={styles.panelTitle}>Villager roster</h2>
              </div>
              <span className={styles.badge}>{hasNpcs ? "Live-ish local snapshot" : "Empty roster"}</span>
            </div>

            {hasNpcs ? (
              <div className={styles.rosterList}>
                {roster.map((npc) => (
                  <article className={styles.rosterItem} key={npc.id}>
                    <div className={styles.rosterHeader}>
                      <div>
                        <h3>{npc.name}</h3>
                        <p className={styles.rosterMeta}>
                          {npc.role} · {npc.mood ?? "steady"}
                        </p>
                      </div>
                      <span className={styles.badge}>{npc.currentAction ?? "idle"}</span>
                    </div>
                    <p className={styles.rosterSummary}>{npc.summary ?? "No summary available yet."}</p>
                    <div className={styles.npcStats}>
                      <span>Energy {toPercent(npc.energy)}%</span>
                      <span>Hunger {toPercent(npc.hunger)}%</span>
                      <span>Social {toPercent(npc.social)}%</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className={styles.emptyStateInline}>
                No villagers are seeded for this town yet. Try a different demo id.
              </div>
            )}

            {notes.length ? (
              <div className={styles.notesBlock}>
                <p className={styles.eyebrow}>Demo notes</p>
                <ul className={styles.notesList}>
                  {notes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}
