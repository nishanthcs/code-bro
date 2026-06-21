import { Braces } from "lucide-react";
import { Link } from "react-router-dom";

export function Brand() {
  return (
    <Link to="/" className="brand" aria-label="CodeBro session library">
      <span className="brand-mark">
        <Braces size={21} strokeWidth={2.4} />
      </span>
      <span>CodeBro</span>
    </Link>
  );
}

