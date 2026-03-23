import { ReactNode } from "react";

interface PracticeLayoutProps {
  children: ReactNode;
  sideContent?: ReactNode;
}

export function PracticeLayout({ children, sideContent }: PracticeLayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-white">
      {/* Scrollable Sidebar (Left Profile/Stats) */}
      <div className="hidden lg:block lg:w-1/2 h-full border-r border-primary/5 overflow-y-auto scrollbar-hide bg-[#F8FAFC]/50">
         {sideContent}
      </div>

      {/* Main Interaction Area (Right) */}
      <div className="w-full lg:w-1/2 h-full relative flex flex-col items-center justify-center overflow-y-auto bg-white">
        {children}
      </div>
    </div>
  );
}
