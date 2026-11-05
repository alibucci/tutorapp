"use client";

import { createContext, useCallback, useContext, useState } from "react";

type Issued = { email: string; password: string };

const IssueContext = createContext<(issued: Issued) => void>(() => {});

/** Hand a new password to the card at the top of the admin pages. */
export function useIssuePassword() {
  return useContext(IssueContext);
}

/**
 * The passwords the server has just shown, on every admin page until each one
 * is dismissed.
 *
 * They live here, in the admin layout, because the layout outlasts the pages
 * inside it. Kept on the tutors page, a card vanished as soon as the admin
 * opened the tutor they had just created, and the password was gone with it.
 *
 * Tab memory only, on purpose: a live password has no business in localStorage.
 * A reload or a sign-out loses it, and Reset password issues another.
 */
export function IssuedPasswords({ children }: { children: React.ReactNode }) {
  const [issued, setIssued] = useState<Issued[]>([]);

  const issue = useCallback(
    (next: Issued) =>
      // A second password for the same tutor replaces the first, which no
      // longer works. Anyone else's card stays until it has been passed on.
      setIssued((all) => [...all.filter((i) => i.email !== next.email), next]),
    [],
  );

  return (
    <IssueContext.Provider value={issue}>
      {issued.length > 0 && (
        <div className="stack-lg mb-8">
          {issued.map((i) => (
            <PasswordCard
              // Keyed by password: a reset starts again from "not copied".
              key={i.password}
              issued={i}
              onDone={() =>
                setIssued((all) => all.filter((other) => other.email !== i.email))
              }
            />
          ))}
        </div>
      )}
      {children}
    </IssueContext.Provider>
  );
}

function PasswordCard({ issued, onDone }: { issued: Issued; onDone: () => void }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="card border-accent bg-accent-soft p-5">
      <p className="t-subtitle">Password for {issued.email}</p>
      <p className="mt-2 font-mono t-title select-all">{issued.password}</p>
      <p className="hint">
        Copy it now - it stays here until you press Done, but a reload loses it.
        It keeps working until the tutor changes it, which they are offered when
        they first sign in.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          onClick={() =>
            void navigator.clipboard
              .writeText(
                `Sign in at ${window.location.origin}/login\nEmail: ${issued.email}\nPassword: ${issued.password}`,
              )
              .then(() => setCopied(true))
          }
          className="btn btn-primary"
        >
          {copied ? "Copied" : "Copy sign-in message"}
        </button>
        <button onClick={onDone} className="btn btn-quiet">
          Done
        </button>
      </div>
    </div>
  );
}
