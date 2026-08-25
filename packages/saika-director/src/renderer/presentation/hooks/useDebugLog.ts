import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useDebugStore } from '../stores/system/debug.store';
import { debugService } from '@/renderer/services';

export function useDebugLog() {
  const { entries, addEntry, setEntries, isVisible, activeTab, toggleVisibility, setActiveTab, clear } = useDebugStore(
    useShallow((state) => ({
      entries: state.entries,
      addEntry: state.addEntry,
      setEntries: state.setEntries,
      isVisible: state.isVisible,
      activeTab: state.activeTab,
      toggleVisibility: state.toggleVisibility,
      setActiveTab: state.setActiveTab,
      clear: state.clear,
    })),
  );

  const refreshLog = useCallback(async () => {
    const result = await debugService.getDebugLog();
    if (result.success) {
      setEntries(result.data.entries);
    }
  }, [setEntries]);

  return {
    entries,
    addEntry,
    setEntries,
    isVisible,
    activeTab,
    toggleVisibility,
    setActiveTab,
    clear,
    refreshLog,
  };
}
