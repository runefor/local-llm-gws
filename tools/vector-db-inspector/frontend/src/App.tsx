import { useState } from "react";
import { CollectionOverview } from "./components/CollectionOverview";
import { ChunkExplorer } from "./components/ChunkExplorer";
import { Database, ShieldAlert } from "lucide-react";

function App() {
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* 상단 통합 헤더 */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 text-white p-2 rounded-xl">
            <Database size={20} />
          </div>
          <div>
            <h1 className="font-extrabold text-slate-800 text-base tracking-tight">Vector DB Inspector</h1>
            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">ChromaDB Chunking Visualizer</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-amber-50 text-amber-700 border border-amber-200 px-3.5 py-1.5 rounded-full text-xs font-semibold">
          <ShieldAlert size={14} />
          Read-Only Mode
        </div>
      </header>

      {/* 메인 캔버스 */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto p-6 overflow-hidden">
        {selectedCollection ? (
          <ChunkExplorer 
            collectionName={selectedCollection} 
            onBack={() => setSelectedCollection(null)} 
          />
        ) : (
          <CollectionOverview 
            onSelectCollection={(name) => setSelectedCollection(name)} 
          />
        )}
      </main>
    </div>
  );
}

export default App;
