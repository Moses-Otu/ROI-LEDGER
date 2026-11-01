import { OnboardingForm } from "./onboarding-form";

export default function OnboardingPage() {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Set up your organisation</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">You can change these later in Settings.</p>
      <OnboardingForm />
    </main>
  );
}
