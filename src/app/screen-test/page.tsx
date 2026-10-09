import { ScreenTest } from "@/components/screen-test/ScreenTest";
import { PageNav } from "@/components/PageNav";

export default function ScreenTestPage() {
  return (
    <div className="relative min-h-dvh w-full">
      <PageNav current="/screen-test" />
      <ScreenTest />
    </div>
  );
}
