import type { Metadata } from "next";
import { cookies } from "next/headers";

import { ensureLocalMockTownState } from "../../../lib/mockData";
import { decodeSession, SESSION_COOKIE_NAME } from "../../../lib/session";
import TownPageClient from "./TownPageClient";
import { normalizeTownId, titleizeTownId } from "./townPresentation";

export const dynamic = "force-dynamic";

interface TownPageProps {
  params: Promise<{
    id: string;
  }>;
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

  return (
    <TownPageClient
      initialTown={ensureLocalMockTownState({ id: initialTownId })}
      initialTownId={initialTownId}
      sessionUser={session?.user ?? null}
    />
  );
}
