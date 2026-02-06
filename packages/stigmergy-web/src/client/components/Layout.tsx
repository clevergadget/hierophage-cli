import { NavLink, Outlet } from 'react-router-dom';

const navSections = [
  {
    items: [
      { to: '/', label: 'Dashboard' },
      { to: '/viz', label: 'Tree' },
      { to: '/run', label: 'Run' },
      { to: '/replay', label: 'Replay' },
    ],
  },
  {
    heading: 'Learn',
    items: [
      { to: '/concepts', label: 'Concepts' },
      { to: '/tree-guide', label: 'Tree Guide' },
      { to: '/agents', label: 'Agents' },
    ],
  },
];

export function Layout() {
  return (
    <div className="flex h-screen bg-[#161625] text-[#e0e0ec] font-mono">
      <nav className="w-48 bg-[#1e1e32] border-r border-[#3a3a55] flex flex-col py-6 px-4 shrink-0">
        <h1 className="text-lg font-bold tracking-widest text-[#f0f0f8] mb-8 px-2">
          STIGMERGY
        </h1>
        {navSections.map((section, si) => (
          <div key={si}>
            {section.heading && (
              <div className="text-[10px] text-[#707088] uppercase tracking-widest px-3 mt-5 mb-2">
                {section.heading}
              </div>
            )}
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `px-3 py-2 rounded text-sm mb-1 transition-colors block ${
                    isActive
                      ? 'bg-[#282845] text-[#60a5fa] font-semibold'
                      : 'text-[#a0a0b8] hover:text-[#e0e0ec] hover:bg-[#252540]'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
