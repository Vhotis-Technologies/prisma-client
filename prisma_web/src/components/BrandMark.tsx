import { Link } from "react-router-dom";
import logo from "../assets/logo.png";

export default function BrandMark({ inverted = false }: { inverted?: boolean }) {
  return (
    <Link className={`brand${inverted ? " brand--inverted" : ""}`} to="/">
      <img className="brand-mark" src={logo} alt="" width={32} height={32} />
      <span className="brand-name">Prisma Car Care</span>
    </Link>
  );
}
