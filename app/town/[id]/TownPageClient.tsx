"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import Town from "../../../components/Town";
import type { SessionUser } from "../../../lib/session";
import type { TownState } from "../../../lib/types";
import { mapTownData } from "./townPresentation";

interface TownPageClientProps {
  initialTown: TownState;
  initialTownId: string;
  sessionUser?: SessionUser | null;
}

async function fetchTick(townId: string, options: { reset?: boolean } = {}): Promise<TownState> {
  const params = new URLSearchParams({ townId, count: "1" });
  if (options.reset) {
    params.set("reset", "true");
  }

  const response = await fetch(`/api/tick?${params.toString()}`);
  const payload = (await response.json()) as { error?: string; ok?: boolean; town?: TownState };

  if (!response.ok || !payload.ok || !payload.town) {
    throw new Error(payload.error ?? "Unable to load local town data.");
  }

  return payload.town;
}

export default function TownPageClient({ initialTown, initialTownId, sessionUser }: TownPageClientProps) {
  const router = useRouter();
  const [townState, setTownState] = useState<TownState>(initialTown);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const townId = initialTownId;
  const town = useMemo(() => mapTownData(townState), [townState]);

  useEffect(() => {
    setTownState(initialTown);
    setIsLoading(false);
    setError(null);
  }, [initialTown]);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    const runTick = async () => {
      if (inFlight) {
        return;
      }

      inFlight = true;
      try {
        const nextTown = await fetchTick(townId);
        if (!cancelled) {
          setTownState(nextTown);
          setError(null);
        }
      } catch (caughtError) {
        if (!cancelled) {
          setError(caughtError instanceof Error ? caughtError.message : "Unable to advance local town data.");
        }
      } finally {
        inFlight = false;
      }
    };

    const interval = window.setInterval(() => {
      void runTick();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [townId]);

  return (
    <Town
      error={error}
      isLoading={isLoading}
      onOpenTown={async (nextTownId) => {
        if (nextTownId !== townId) {
          router.push(`/town/${encodeURIComponent(nextTownId)}`);
          return;
        }

        setIsLoading(true);
        setError(null);

        try {
          const nextTown = await fetchTick(nextTownId, { reset: true });
          setTownState(nextTown);
        } catch (caughtError) {
          setError(caughtError instanceof Error ? caughtError.message : "Unable to reset local town data.");
        } finally {
          setIsLoading(false);
        }
      }}
      sessionUser={sessionUser}
      town={town}
      townId={townId}
    />
  );
}
