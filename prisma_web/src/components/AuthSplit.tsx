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
  kicker = "Client portal",
  headline,
  support,
  children,
  alignTop = false,
}: AuthSplitProps) {
  return (
    <div className="auth-layout">
      <aside className="auth-panel">
        <BrandMark inverted />
        <div className="auth-panel-copy">
          <p className="auth-kicker">{kicker}</p>
          <h1>{headline}</h1>
          <p>{support}</p>
        </div>
      </aside>
      <main className={`auth-main${alignTop ? " auth-main--top" : ""}`}>{children}</main>
    </div>
  );
}
