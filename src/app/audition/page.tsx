import { Audition } from "@/components/audition/Audition";
import { PageNav } from "@/components/PageNav";

export default function AuditionPage() {
  return (
    <div className="relative min-h-dvh w-full">
      <PageNav current="/audition" />
      <Audition />
    </div>
  );
}
