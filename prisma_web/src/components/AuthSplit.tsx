import type { ReactNode } from "react";
import BrandMark from "./BrandMark";

type AuthSplitProps = {
  kicker?: string;
  headline: string;
  support: string;
  children: ReactNode;
  alignTop?: boolean;
};

export default function AuthSplit({
  kicker = "Prisma Car Care",
  headline,
  support,
  children,
  alignTop = false,
}: AuthSplitProps) {
  return (
    <div className="auth-layout">
      <header className="auth-header">
        <BrandMark inverted />
      </header>
      <main className={`auth-main${alignTop ? " auth-main--top" : ""}`}>
        <div className="auth-intro">
          <p className="auth-kicker">{kicker}</p>
          <h1>{headline}</h1>
          <p>{support}</p>
        </div>
        {children}
      </main>
    </div>
  );
}
