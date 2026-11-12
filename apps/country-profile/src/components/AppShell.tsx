import { NavLink, Outlet } from "react-router-dom";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `rounded px-2.5 py-1 text-sm transition-colors ${
    isActive
      ? "bg-gl-text text-white"
      : "text-gl-muted hover:bg-gl-bg hover:text-gl-text"
  }`;

export function AppShell() {
  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-gl-border bg-white px-4 py-2">
        <div className="flex items-center gap-6">
          <span className="text-sm font-semibold">Institutional Complexity</span>
          <nav className="flex items-center gap-1">
            <NavLink to="/country" className={navLinkClass}>
              Country profile
            </NavLink>
            <NavLink to="/country-space" className={navLinkClass}>
              Country space
            </NavLink>
            {/* Nepal fork */}
            <NavLink to="/capital-expenditure" className={navLinkClass}>
              Capital expenditure
            </NavLink>
          </nav>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-auto">
        <Outlet />
      </div>
    </div>
  );
}
