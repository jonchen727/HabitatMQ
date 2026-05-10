"use client";

import { BottomNav } from "@/components/blocks/navigation";
import { MqttProvider } from "@/providers/mqtt-provider";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <MqttProvider>
      <div className="relative min-h-dvh flex flex-col text-foreground bg-background">
        <main className="flex-1 w-full max-w-lg md:max-w-3xl lg:max-w-5xl mx-auto px-5 md:px-8 pt-2 pb-20">
          {children}
        </main>
        <BottomNav />
      </div>
    </MqttProvider>
  );
}

