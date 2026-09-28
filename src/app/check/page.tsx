import { MicCheck } from "@/components/MicCheck";

export const metadata = { title: "Device check" };

/**
 * Open this on the device that will record, before the first real lesson.
 *
 * Deliberately outside every route group and behind no login: when capture
 * fails, it fails silently and the tutor has no way to tell whether the problem
 * is the browser, the page, the microphone or the network. This answers that in
 * about thirty seconds.
 */
export default function CheckPage() {
  return (
    <main data-density="comfortable" className="page page-narrow flex-1 py-10">
      <header className="mb-8">
        <p className="t-eyebrow">Before your first lesson</p>
        <h1 className="t-display mt-2">Device check</h1>
        <p className="t-body t-muted mt-2 measure">
          Run this on the device and browser you will actually record with. It
          takes about thirty seconds.
        </p>
      </header>
      <MicCheck />
    </main>
  );
}
