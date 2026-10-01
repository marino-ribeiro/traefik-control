import { getSnapshot } from "@/lib/snapshot";
import { editableNames, lockedNames } from "@/lib/config-store";
import { PageHeader } from "@/components/ui/primitives";
import { SnapshotError } from "@/components/shell/SnapshotError";
import { MiddlewaresView } from "@/components/views/MiddlewaresView";

export const dynamic = "force-dynamic";

export default async function MiddlewaresPage() {
  const [{ snapshot, error, target }, owned] = await Promise.all([getSnapshot(), editableNames()]);
  if (!snapshot) return <SnapshotError eyebrow="Middlewares" target={target} error={error} />;

  const all = [...snapshot.middlewares.http, ...snapshot.middlewares.tcp];
  const orphans = all.filter((m) => !m.usedBy?.length).length;

  return (
    <>
      <PageHeader
        eyebrow="Cadeia"
        title="Middlewares"
        subtitle="Transformações aplicadas à requisição antes de chegar no service — auth, headers, rate limit, compressão."
        action={
          <div className="text-right">
            <span className="label-caps block">Total</span>
            <span className="title-black text-[36px] tabular-nums">{all.length}</span>
            {orphans > 0 && (
              <span className="mt-1 block text-[12px] text-muted">{orphans} sem uso</span>
            )}
          </div>
        }
      />
      <MiddlewaresView middlewares={all} owned={owned.http.middlewares} locked={lockedNames().http.middlewares} />
    </>
  );
}
