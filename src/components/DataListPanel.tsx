import { useApp } from "../context/AppContext";

interface DataListPanelProps {
  isDesktop?: boolean;
}

export default function DataListPanel({ isDesktop = false }: DataListPanelProps) {
  const { 
    gmailItems, 
    driveItems, 
    activeTab, 
    setActiveTab 
  } = useApp();

  if (gmailItems.length === 0 && driveItems.length === 0) return null;

  return (
    <div className={`bg-surface rounded-2xl p-6 border border-surface-variant shadow-[0_1px_2px_0_rgba(0,0,0,0.05)] space-y-4 flex flex-col ${isDesktop ? "h-full min-h-0 overflow-hidden" : ""}`}>
      <div className="flex items-center justify-between border-b border-surface-variant/80 pb-3 flex-shrink-0">
        <h2 className="text-base font-semibold flex items-center text-text-primary">
          <span className="material-symbols-rounded mr-2 text-primary">database</span>
          동기화된 지식 데이터
        </h2>
        
        <div className="flex space-x-1 bg-[#f0f4f9] p-1 rounded-full border border-surface-variant/40 text-xs">
          <button 
            onClick={() => setActiveTab("gmail")}
            className={`px-4 py-1.5 rounded-full font-medium transition-all cursor-pointer ${activeTab === "gmail" ? "bg-primary-container text-primary shadow-sm" : "text-text-secondary hover:text-text-primary"}`}
          >
            Gmail ({gmailItems.length})
          </button>
          <button 
            onClick={() => setActiveTab("drive")}
            className={`px-4 py-1.5 rounded-full font-medium transition-all cursor-pointer ${activeTab === "drive" ? "bg-primary-container text-primary shadow-sm" : "text-text-secondary hover:text-text-primary"}`}
          >
            Drive ({driveItems.length})
          </button>
        </div>
      </div>

      {activeTab === "gmail" ? (
        <div className={`space-y-3 pr-2 scrollbar-none hover:scrollbar-thin scrollbar-thumb-surface-variant scrollbar-track-transparent ${isDesktop ? "flex-1 overflow-y-auto" : "max-h-96 overflow-y-auto"}`}>
          {gmailItems.length === 0 ? (
            <div className="text-center py-8 text-text-secondary text-xs">
              가져온 Gmail 데이터가 없습니다. 동기화를 실행하세요.
            </div>
          ) : (
            gmailItems.map((item) => (
              <div key={item.id} className="bg-white p-4 rounded-2xl border border-surface-variant hover:border-primary/20 transition-all shadow-[0_1px_2px_0_rgba(0,0,0,0.02)]">
                <div className="flex justify-between items-start mb-1.5">
                  <span className="text-xs font-semibold text-primary truncate max-w-[150px]">{item.from}</span>
                  <span className="text-[10px] text-text-secondary font-mono">ID: {item.id}</span>
                </div>
                <h4 className="text-sm font-semibold text-text-primary mb-1.5 line-clamp-1">{item.subject}</h4>
                <p className="text-xs text-text-secondary line-clamp-2 leading-relaxed">{item.snippet}</p>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className={`space-y-3 pr-2 scrollbar-none hover:scrollbar-thin scrollbar-thumb-surface-variant scrollbar-track-transparent ${isDesktop ? "flex-1 overflow-y-auto" : "max-h-96 overflow-y-auto"}`}>
          {driveItems.length === 0 ? (
            <div className="text-center py-8 text-text-secondary text-xs">
              가져온 Google Drive 문서가 없습니다. 동기화를 실행하세요.
            </div>
          ) : (
            driveItems.map((item) => (
              <div key={item.id} className="bg-white p-4 rounded-2xl border border-surface-variant hover:border-primary/20 transition-all flex items-center justify-between shadow-[0_1px_2px_0_rgba(0,0,0,0.02)]">
                <div className="flex items-center space-x-3 overflow-hidden mr-4">
                  <span className="p-2 rounded-xl bg-surface-variant/30 text-primary flex items-center justify-center w-8 h-8 flex-shrink-0">
                    {item.mimeType.includes("document") ? (
                      <span className="material-symbols-rounded text-lg text-primary">description</span>
                    ) : item.mimeType.includes("spreadsheet") ? (
                      <span className="material-symbols-rounded text-lg text-primary">table_chart</span>
                    ) : (
                      <span className="material-symbols-rounded text-lg text-primary">article</span>
                    )}
                  </span>
                  <div className="overflow-hidden">
                    <h4 className="text-sm font-semibold text-text-primary truncate">{item.name}</h4>
                    <p className="text-[10px] text-text-secondary font-mono mt-0.5">MimeType: {item.mimeType.split('.').pop()}</p>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <span className="text-[10px] text-text-secondary block font-mono">{new Date(item.modifiedTime).toLocaleDateString()}</span>
                  <span className="text-[9px] text-text-secondary block font-mono mt-0.5">{new Date(item.modifiedTime).toLocaleTimeString()}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
