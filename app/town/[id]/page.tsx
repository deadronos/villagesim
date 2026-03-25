import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { ensureAuthoritativeTown, isHostedConvexModeEnabled } from "../../../lib/authoritativeTownStore";
import { ensureLocalMockTownState, findLocalMockTownState } from "../../../lib/mockData";
import { decodeSession, SESSION_COOKIE_NAME } from "../../../lib/session";
import { canAccessTown, isTownAccessError } from "../../../lib/townAccess";
import TownPageClient from "./TownPageClient";
import { normalizeTownId, titleizeTownId } from "./townPresentation";

export const dynamic = "force-dynamic";

interface TownPageProps {
  params: Promise<{
    id: string;
  }>;
}

function redirectToSessionTownOrHome(sessionTownId: string | null | undefined): never {
  if (sessionTownId) {
    redirect(`/town/${encodeURIComponent(sessionTownId)}`);
  }
  redirect("/");
}

export async function generateMetadata({ params }: TownPageProps): Promise<Metadata> {
  const { id } = await params;
  const townId = normalizeTownId(id);

  return {
    title: `${titleizeTownId(townId)} | VillageSim`,
    description: "Explore a tiny seeded village with shared mock NPC state and a local-first starter flow.",
  };
}

export default async function TownPage({ params }: TownPageProps) {
  const { id } = await params;
  const initialTownId = normalizeTownId(id);

  const cookieStore = await cookies();
  const sessionValue = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = sessionValue ? decodeSession(sessionValue) : null;
  let initialTown = null;

  if (isHostedConvexModeEnabled()) {
    try {
      initialTown = await ensureAuthoritativeTown({
        callerLogin: session?.user.login ?? null,
        sessionUser: session?.user ?? null,
        townId: initialTownId,
      });
    } catch (error) {
      if (isTownAccessError(error)) {
        redirectToSessionTownOrHome(session?.townId);
      }
      throw error;
    }
  } else {
    const existingTown = findLocalMockTownState(initialTownId);

    if (existingTown && !canAccessTown(existingTown, session?.user.login)) {
      redirectToSessionTownOrHome(session?.townId);
    }

    initialTown = existingTown ?? ensureLocalMockTownState({ id: initialTownId });
  }

  if (!initialTown) {
    redirectToSessionTownOrHome(session?.townId);
  }

  return (
    <TownPageClient
      initialTown={initialTown}
      initialTownId={initialTownId}
      sessionTownId={session?.townId ?? null}
      sessionUser={session?.user ?? null}
    />
  );
}
