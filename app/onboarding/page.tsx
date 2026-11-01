import { Button } from "@/components/ui/button";
import { createDemo } from "./actions";
import { OnboardingForm } from "./onboarding-form";

export default function OnboardingPage() {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Set up your organisation</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">You can change these later in Settings.</p>
      <OnboardingForm />
      <div className="mt-10 border-t pt-6">
        <h2 className="text-sm font-medium">Just looking?</h2>
        <p className="mt-1 mb-3 text-sm text-muted-foreground">
          Create a separate demo organisation with six months of clearly fake data for a procurement assistant. You can
          delete it any time from Settings.
        </p>
        <form action={createDemo}>
          <Button type="submit" variant="outline">
            Explore with demo data
          </Button>
        </form>
      </div>
    </main>
  );
}
