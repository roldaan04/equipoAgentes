import type { Metadata } from "next";
import { Suspense } from "react";
import { PanelSkeleton, RunPanel } from "@/components/RunPanel";

export const metadata: Metadata = { title: "Run en directo · Agent Team" };

// Con cacheComponents, leer params es dato de petición: va dentro de <Suspense>.
export default function RunPage({ params }: PageProps<"/runs/[id]">) {
  return (
    <Suspense fallback={<PanelSkeleton />}>
      <RunPanelFromParams params={params} />
    </Suspense>
  );
}

async function RunPanelFromParams({ params }: { params: PageProps<"/runs/[id]">["params"] }) {
  const { id } = await params;
  return <RunPanel runId={id} />;
}
