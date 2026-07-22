import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white">
            FB
          </div>
          <h1 className="text-2xl font-bold text-slate-900">FreshBiz Leads</h1>
          <p className="mt-1 text-sm text-slate-500">
            AI-assisted business lead discovery and enrichment
          </p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-card">
          <h2 className="mb-1 text-lg font-semibold text-slate-900">
            Sign in to your account
          </h2>
          <p className="mb-6 text-sm text-slate-500">
            Internal access only. Contact an administrator for an account.
          </p>
          <LoginForm />
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          By signing in you agree to our{" "}
          <Link href="/terms" className="underline hover:text-slate-600">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline hover:text-slate-600">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
