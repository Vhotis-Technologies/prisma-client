import AppShell from "../components/AppShell";

type ComingSoonPageProps = {
  kicker?: string;
  title: string;
  body: string;
};

export default function ComingSoonPage({
  kicker = "Coming next",
  title,
  body,
}: ComingSoonPageProps) {
  return (
    <AppShell>
      <section className="welcome">
        <p className="kicker">{kicker}</p>
        <h1 className="page-title">{title}</h1>
        <p className="lede">{body}</p>
      </section>
    </AppShell>
  );
}
