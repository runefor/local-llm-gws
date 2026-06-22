import { readFileSync } from "node:fs";

const files = {
  helper: readFileSync("src/components/savedSearchConditions.ts", "utf8"),
  gmail: readFileSync("src/components/HybridMailWorkspace.tsx", "utf8"),
  drive: readFileSync("src/components/DriveSearchWorkspace.tsx", "utf8"),
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function bodyAfter(source, functionName) {
  const start = source.indexOf(`const ${functionName} = () => {`);
  assert(start >= 0, `${functionName} not found`);
  return source.slice(start, source.indexOf("};", start) + 2);
}

const forbiddenStoredKeys = ["gmailItems", "driveItems", "selectedIds", "messageId", "fileId", "threadId", "resourceKey"];
const forbiddenApplyCalls = ["searchGmailMetadata(", "searchDriveMetadata(", "vectorizeGmailMessages(", "fetchOriginalDetail("];

assert(files.helper.includes("window.localStorage"), "helper must use localStorage");
assert(files.helper.includes("JSON.parse") && files.helper.includes("JSON.stringify"), "helper must roundtrip JSON");
assert(files.helper.includes("catch {\n    return [];\n  }"), "helper must recover broken JSON as empty list");

for (const key of forbiddenStoredKeys) {
  assert(!bodyAfter(files.gmail, "handleSaveCondition").includes(key), `Gmail save must not store ${key}`);
  assert(!bodyAfter(files.drive, "handleSaveCondition").includes(key), `Drive save must not store ${key}`);
}

for (const call of forbiddenApplyCalls) {
  assert(!bodyAfter(files.gmail, "handleApplyCondition").includes(call), `Gmail apply must not call ${call}`);
  assert(!bodyAfter(files.drive, "handleApplyCondition").includes(call), `Drive apply must not call ${call}`);
}

assert(files.gmail.includes("local-llm-gws:gmail-original-search-conditions:v1"), "Gmail storage key missing");
assert(files.drive.includes("local-llm-gws:drive-original-search-conditions:v1"), "Drive storage key missing");
assert(files.gmail.includes("검색은 실행하지 않았습니다"), "Gmail apply must tell user search did not run");
assert(files.drive.includes("검색은 실행하지 않았습니다"), "Drive apply must tell user search did not run");

console.log("saved search condition checks passed");
