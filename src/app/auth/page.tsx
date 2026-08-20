import Link from "next/link";
import { authMessage } from "@/features/auth/messages";
import { safeDestination } from "@/features/auth/routing";
import { signIn, signUp } from "./actions";

type AuthPageProps = {
  searchParams: Promise<{ message?: string | string[]; next?: string | string[] }>;
};

export default async function AuthPage({ searchParams }: AuthPageProps) {
  const query = await searchParams;
  const nextValue = Array.isArray(query.next) ? query.next[0] : query.next;
  const next = safeDestination(nextValue);
  const message = authMessage(query.message);
  const isNotice = query.message === "check_email";

  return (
    <main className="auth-shell">
      <section className="auth-intro" aria-labelledby="auth-title">
        <Link className="wordmark" href="/">SUN Trip</Link>
        <p className="eyebrow">Private Alpha</p>
        <h1 id="auth-title">Your trip starts here.</h1>
        <p className="lede">Sign in to continue to your protected planning workspace.</p>
      </section>
      <section className="auth-card" aria-label="Account access">
        {message ? (
          <p className={isNotice ? "auth-message notice" : "auth-message error"} role={isNotice ? "status" : "alert"}>{message}</p>
        ) : null}
        <form className="auth-form">
          <input type="hidden" name="next" value={next} />
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" inputMode="email" autoComplete="email" required />
          <label htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" minLength={8} maxLength={128} required />
          <div className="auth-actions">
            <button formAction={signIn} className="primary" type="submit">Sign in</button>
            <button formAction={signUp} className="secondary" type="submit">Create account</button>
          </div>
        </form>
        <p className="auth-footnote">Use at least 8 characters. Email confirmation may be required.</p>
      </section>
    </main>
  );
}
