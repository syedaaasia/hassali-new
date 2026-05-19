import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <SignIn
        path="/sign-in"
        routing="path"
        signUpUrl="/sign-up"
        fallbackRedirectUrl="/dashboard"
        appearance={{
          variables: {
            colorPrimary: "hsl(170 40% 42%)"
          }
        }}
      />
    </main>
  );
}
