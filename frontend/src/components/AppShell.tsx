import type { ReactNode } from "react";
import { Brand } from "./Brand";
import { ThemeToggle } from "./ThemeToggle";

export function AppShell({
  actions,
  children,
  compact = false,
}: {
  actions?: ReactNode;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "app-shell app-shell--compact" : "app-shell"}>
      <header className="topbar">
        <Brand />
        <div className="topbar-actions">
          {actions}
          <ThemeToggle />
        </div>
      </header>
      {children}
    </div>
  );
}

