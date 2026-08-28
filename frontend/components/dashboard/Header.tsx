"use client";

import { motion } from "motion/react";
import { Activity, LayoutGrid, ListChecks, ChevronRight, Bell, Search, Settings } from "lucide-react";

const NAV_ITEMS = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "cases", label: "Cases", icon: ListChecks },
  { id: "activity", label: "Activity", icon: Activity },
] as const;

type SectionId = (typeof NAV_ITEMS)[number]["id"];

export function Header({ active, onNavigate }: { active: SectionId; onNavigate: (id: SectionId) => void }) {
  const activeNav = NAV_ITEMS.find((n) => n.id === active);
  return (
    <>
      <header className="border-b border-border/60 bg-card/60 backdrop-blur-xl sticky top-0 z-30">
        <div className="w-full px-5 lg:px-10 xl:px-14">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2.5">
                <div className="size-8 rounded-xl bg-primary/12 flex items-center justify-center glow-teal-sm">
                  <Activity className="size-4 text-primary" />
                </div>
                <span className="text-lg font-semibold tracking-[-0.01em]">Recovery Console</span>
              </div>
              <div className="hidden md:flex items-center gap-1 ml-3 text-xs text-muted-foreground">
                <span>Batch</span>
                <ChevronRight className="size-3 text-muted-foreground/50" />
                <span className="text-foreground font-semibold">{activeNav?.label}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button className="p-2.5 rounded-xl hover:bg-accent/50 transition-all duration-200" aria-label="Search">
                <Search className="size-4 text-muted-foreground" />
              </button>
              <button className="p-2.5 rounded-xl hover:bg-accent/50 transition-all duration-200" aria-label="Notifications">
                <Bell className="size-4 text-muted-foreground" />
              </button>
              <button className="p-2.5 rounded-xl hover:bg-accent/50 transition-all duration-200" aria-label="Settings">
                <Settings className="size-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <nav className="border-b border-border/40 bg-card/40 backdrop-blur-xl sticky top-16 z-20">
        <div className="w-full px-5 lg:px-10 xl:px-14">
          <div className="flex items-center gap-0.5 overflow-x-auto py-1.5 -mb-px scrollbar-none">
            {NAV_ITEMS.map((item) => {
              const isActive = item.id === active;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className={`relative flex items-center gap-2 px-4 py-2.5 text-[13px] font-semibold rounded-xl transition-all duration-250 whitespace-nowrap shrink-0 ${
                    isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-accent/30"
                  }`}
                >
                  <Icon className="size-4" />
                  <span>{item.label}</span>
                  {isActive && (
                    <motion.div
                      layoutId="nav-indicator"
                      className="absolute bottom-0 left-4 right-4 h-0.5 rounded-full bg-primary"
                      style={{ boxShadow: "0 0 8px 2px oklch(0.68 0.17 255 / 0.3)" }}
                      transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </nav>
    </>
  );
}

export function MeshBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0">
      <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full opacity-[0.03] blur-[120px] animate-float" style={{ background: "oklch(0.68 0.17 255)" }} />
      <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] rounded-full opacity-[0.02] blur-[100px] animate-float" style={{ background: "oklch(0.75 0.14 88)", animationDelay: "3s" }} />
    </div>
  );
}