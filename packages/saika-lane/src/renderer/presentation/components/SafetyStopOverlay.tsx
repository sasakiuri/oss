import { useSafetyStopStore } from '@/renderer/presentation/stores/safetyStopStore';

/** Non-dismissible, top-most Lane indication required while the safety latch is active. */
export function SafetyStopOverlay() {
  const state = useSafetyStopStore((store) => store.state);
  if (state.status !== 'STOPPED') return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex cursor-default items-center justify-center bg-red-950 text-white"
      role="alert"
      aria-live="assertive"
      data-testid="safety-stop-overlay"
    >
      <div className="max-w-5xl border-8 border-white bg-red-700 px-16 py-12 text-center shadow-2xl">
        <div className="text-8xl font-black tracking-[0.18em]">STOP</div>
        <div className="mt-5 text-5xl font-black">UNLOAD</div>
        <div className="mt-8 text-2xl font-semibold">Do not fire. Await Range Officer instructions.</div>
        {state.reason && <div className="mt-5 text-lg">{state.reason}</div>}
        <div className="mt-8 text-sm opacity-90">Safety stop {state.safetyStopId?.slice(0, 8)}</div>
      </div>
    </div>
  );
}
