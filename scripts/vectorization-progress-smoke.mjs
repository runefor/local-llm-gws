import { readFileSync } from "node:fs";

const appContext = readFileSync("src/context/AppContext.tsx", "utf8");
const desktopLayout = readFileSync("src/layouts/DesktopLayout.tsx", "utf8");
const hybridWorkspace = readFileSync("src/components/HybridMailWorkspace.tsx", "utf8");
const ragSearchPanel = readFileSync("src/components/RagSearchPanel.tsx", "utf8");

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

assert(appContext.includes("vectorizationProgress"), "AppContext must own vectorizationProgress so tab unmounts do not lose the job state.");
assert(appContext.includes("indexRagSources"), "RAG indexing must run through AppContext, not a tab-local component.");
assert(desktopLayout.includes("탭을 이동해도 이 작업은 백그라운드에서 계속 실행됩니다."), "DesktopLayout must render a cross-tab background progress card.");
assert(hybridWorkspace.includes("vectorizationProgress.status === \"running\""), "Gmail vectorizing state must come from AppContext.");
assert(!hybridWorkspace.includes("const [vectorizing, setVectorizing]"), "HybridMailWorkspace must not keep vectorizing as local state.");
assert(ragSearchPanel.includes("indexRagSources(selectedSources)"), "RAG index refresh must use the AppContext background job.");
assert(!ragSearchPanel.includes("const [indexing, setIndexing]"), "RagSearchPanel must not keep indexing as local state.");

console.log("vectorization background progress contract: ok");
