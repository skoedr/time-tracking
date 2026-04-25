/**
 * v1.4 Mini-Widget — always-on-top 200x40 overlay showing the running timer.
 *
 * B1 (this commit): stub that renders the static "Kein Timer" state.
 * B2 will wire the real timer state via push-sync from the main process.
 */
export default function MiniApp(): React.JSX.Element {
  return (
    <div
      className="
        drag-region
        flex h-10 w-[200px] items-center gap-2 px-3
        rounded-md bg-slate-900/90 backdrop-blur-sm
        text-sm text-slate-200
        select-none
      "
    >
      <span className="h-2 w-2 rounded-full bg-slate-600" aria-hidden />
      <span className="flex-1 truncate text-slate-400">Kein Timer</span>
      <button
        type="button"
        aria-label="Timer starten"
        className="
          no-drag-region
          h-6 w-6 flex items-center justify-center
          rounded text-slate-400 hover:bg-slate-700 hover:text-slate-100
        "
      >
        ▶
      </button>
    </div>
  )
}
