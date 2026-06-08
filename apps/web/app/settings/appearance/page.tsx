import { ThemeControls } from "@/components/theme-controls";

export default function AppearanceSettingsPage() {
  return (
    <div className="rounded-[2rem] bg-zinc-950/70 p-6 shadow-[var(--trail-shadow-border)] sm:p-8">
      <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-zinc-500">
        Appearance
      </div>
      <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-zinc-50">Theme</h2>
      <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-500">
        Choose how Trail looks on this device. Dark is the default, and your choice is saved per
        device.
      </p>
      <div className="mt-8">
        <ThemeControls />
      </div>
    </div>
  );
}
