"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Package, Bug, Wrench, Zap, Server } from "lucide-react";
import Link from "next/link";

interface ChangelogEntry {
  text: string;
}

interface ChangelogSection {
  category: string;
  entries: ChangelogEntry[];
}

interface ChangelogVersion {
  version: string;
  date: string;
  sections: ChangelogSection[];
}

const categoryMeta: Record<string, { icon: typeof Package; color: string; bg: string }> = {
  Added:          { icon: Package, color: "text-emerald-400", bg: "bg-emerald-400/10" },
  Fixed:          { icon: Bug,     color: "text-amber-400",   bg: "bg-amber-400/10" },
  Changed:        { icon: Wrench,  color: "text-blue-400",    bg: "bg-blue-400/10" },
  Performance:    { icon: Zap,     color: "text-purple-400",  bg: "bg-purple-400/10" },
  Infrastructure: { icon: Server,  color: "text-slate-400",   bg: "bg-slate-400/10" },
};

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

function getCategoryStyle(category: string) {
  return categoryMeta[category] ?? categoryMeta["Changed"];
}

/** Strip markdown bold markers for display */
function renderEntry(text: string) {
  // Convert **text** to <strong>
  return text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

export default function ChangelogPage() {
  const [versions, setVersions] = useState<ChangelogVersion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/changelog")
      .then((r) => r.json())
      .then((d) => { setVersions(d.versions ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-6 pt-5 pb-24"
    >
      {/* Header */}
      <motion.div variants={item} className="flex items-center gap-3">
        <Link
          href="/config"
          className="p-2 -ml-2 rounded-xl text-white/40 hover:text-white/70 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Changelog</h1>
          <p className="text-xs text-white/30 mt-0.5">What&apos;s new in HabitatMQ</p>
        </div>
      </motion.div>

      {loading && (
        <motion.div variants={item} className="text-center text-white/30 py-12">
          Loading changelog…
        </motion.div>
      )}

      {/* Version cards */}
      {versions.map((v) => (
        <motion.div
          key={v.version}
          variants={item}
          className="rounded-2xl overflow-hidden"
          style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.04)",
          }}
        >
          {/* Version header */}
          <div className="px-5 py-4 flex items-baseline justify-between border-b border-white/[0.04]">
            <span className="font-mono text-sm font-semibold text-emerald-400">
              v{v.version}
            </span>
            <span className="text-xs text-white/25 font-mono">{v.date}</span>
          </div>

          {/* Sections */}
          <div className="px-5 py-4 space-y-5">
            {v.sections.map((section) => {
              const style = getCategoryStyle(section.category);
              const Icon = style.icon;
              return (
                <div key={section.category}>
                  <div className="flex items-center gap-2 mb-2.5">
                    <div className={`p-1 rounded-lg ${style.bg}`}>
                      <Icon className={`w-3.5 h-3.5 ${style.color}`} />
                    </div>
                    <span className={`text-xs font-semibold uppercase tracking-wider ${style.color}`}>
                      {section.category}
                    </span>
                  </div>
                  <ul className="space-y-1.5 ml-1">
                    {section.entries.map((entry, i) => (
                      <li
                        key={i}
                        className="text-sm text-white/50 leading-relaxed pl-4 relative before:absolute before:left-0 before:top-[9px] before:w-1.5 before:h-1.5 before:rounded-full before:bg-white/10"
                        dangerouslySetInnerHTML={{ __html: renderEntry(entry.text) }}
                      />
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </motion.div>
      ))}

      {!loading && versions.length === 0 && (
        <motion.div variants={item} className="text-center text-white/30 py-12">
          No changelog entries found.
        </motion.div>
      )}
    </motion.div>
  );
}
