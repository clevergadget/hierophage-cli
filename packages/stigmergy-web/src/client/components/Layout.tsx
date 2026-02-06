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
    <div className="flex h-screen bg-white text-slate-800 font-sans">
      <nav className="w-56 bg-slate-50 border-r border-slate-200 flex flex-col py-6 px-4 shrink-0">
        <h1 className="text-lg font-bold tracking-tight text-slate-900 mb-8 px-2 font-serif flex items-center gap-2">
          <span className="w-3 h-3 bg-blue-600 rounded-full"></span>
          STIGMERGY
        </h1>
        {navSections.map((section, si) => (
          <div key={si}>
            {section.heading && (
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-3 mt-6 mb-2">
                {section.heading}
              </div>
            )}
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-md text-sm mb-0.5 transition-colors block font-medium ${
                    isActive
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <main className="flex-1 overflow-auto bg-white">
        <Outlet />
      </main>
    </div>
  );
}
