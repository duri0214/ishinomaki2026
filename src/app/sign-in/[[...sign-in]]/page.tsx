import { SignIn } from "@clerk/nextjs";
import { AuthDisabledNotice } from "@/features/auth/AuthDisabledNotice";
import { isClerkConfigured } from "@/lib/env";

export default function SignInPage() {
  return (
    <main className="flex min-h-[70vh] items-center justify-center p-6">
      {isClerkConfigured() ? <SignIn /> : <AuthDisabledNotice />}
    </main>
  );
}
