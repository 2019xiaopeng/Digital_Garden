import React, { createContext, useContext, useMemo, useState } from "react";

export type SelectedKnowledgeFile = {
  id: string;
  name: string;
  path?: string;
};

type KnowledgeSelectionContextValue = {
  selected_knowledge_files: SelectedKnowledgeFile[];
  setSelectedKnowledgeFiles: (files: SelectedKnowledgeFile[]) => void;
};

const KnowledgeSelectionContext = createContext<KnowledgeSelectionContextValue | null>(null);

export function KnowledgeSelectionProvider({ children }: { children: React.ReactNode }) {
  const [selectedKnowledgeFiles, setSelectedKnowledgeFiles] = useState<SelectedKnowledgeFile[]>([]);

  const value = useMemo<KnowledgeSelectionContextValue>(() => ({
    selected_knowledge_files: selectedKnowledgeFiles,
    setSelectedKnowledgeFiles,
  }), [selectedKnowledgeFiles]);

  return (
    <KnowledgeSelectionContext.Provider value={value}>
      {children}
    </KnowledgeSelectionContext.Provider>
  );
}

export function useKnowledgeSelection() {
  const context = useContext(KnowledgeSelectionContext);
  if (!context) {
    throw new Error("useKnowledgeSelection must be used within KnowledgeSelectionProvider");
  }
  return context;
}
