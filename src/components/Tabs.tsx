'use client';

import { useUIStore, type TabId } from '@/stores/uiStore';

// ─── Nav Icons (from icons.js ICON object) ───

function UsualsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2Z" />
      <path d="M4.271 18.3457C4.271 18.3457 6.50002 15.5 12 15.5C17.5 15.5 19.7291 18.3457 19.7291 18.3457" />
      <path d="M12 12C13.6569 12 15 10.6569 15 9C15 7.34315 13.6569 6 12 6C10.3431 6 9 7.34315 9 9C9 10.6569 10.3431 12 12 12Z" />
    </svg>
  );
}

function ExploreIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.5857 10.5857L16.9496 7.0502L13.4141 13.4142L7.05012 16.9497L10.5857 10.5857Z" />
      <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" />
    </svg>
  );
}

function PlannerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 4V2m0 2v2m0-2h-4.5M3 10v9a2 2 0 002 2h14a2 2 0 002-2v-9H3zM3 10V6a2 2 0 012-2h2M7 2v4M21 10V6a2 2 0 00-2-2h-.5" />
    </svg>
  );
}

const TAB_CONFIG: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'usuals', label: 'Usuals', icon: <UsualsIcon /> },
  { id: 'explore', label: 'Explore', icon: <ExploreIcon /> },
  { id: 'planner', label: 'Planner', icon: <PlannerIcon /> },
];

export default function Tabs() {
  const activeTab = useUIStore((s) => s.activeTab);
  const setActiveTab = useUIStore((s) => s.setActiveTab);

  return (
    <nav className="nav">
      {TAB_CONFIG.map(({ id, label, icon }) => (
        <button
          key={id}
          className={`nav-btn${activeTab === id ? ' active' : ''}`}
          onClick={() => setActiveTab(id)}
        >
          <span className="nav-icon">{icon}</span> {label}
        </button>
      ))}
    </nav>
  );
}
