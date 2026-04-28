/**
 * Auth layout — no nav chrome, no sidebar, just a bare page.
 * Used for /login (and any future /forgot-password etc.)
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
