import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">AI ROI Ledger</h1>
      <p className="mt-1 mb-6 text-sm text-muted-foreground">
        See whether each AI deployment is paying for itself.
      </p>
      <LoginForm />
    </main>
  );
}
