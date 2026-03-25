"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";

// Track which forms have unsaved changes
interface FormDirtyState {
  [formId: string]: {
    isDirty: boolean;
    formName: string;
  };
}

interface FormDirtyContextValue {
  // Current dirty forms
  dirtyForms: FormDirtyState;
  // Mark a form as dirty (has unsaved changes)
  markDirty: (formId: string, formName: string) => void;
  // Mark a form as clean (saved)
  markClean: (formId: string) => void;
  // Check if any forms are dirty
  hasDirtyForms: () => boolean;
  // Get list of dirty form names
  getDirtyFormNames: () => string[];
  // Clear all dirty forms (used after forced logout)
  clearAll: () => void;
}

const FormDirtyContext = createContext<FormDirtyContextValue | null>(null);

export function FormDirtyProvider({ children }: { children: ReactNode }) {
  const [dirtyForms, setDirtyForms] = useState<FormDirtyState>({});

  const markDirty = useCallback((formId: string, formName: string) => {
    setDirtyForms((prev) => ({
      ...prev,
      [formId]: { isDirty: true, formName },
    }));
  }, []);

  const markClean = useCallback((formId: string) => {
    setDirtyForms((prev) => {
      const next = { ...prev };
      delete next[formId];
      return next;
    });
  }, []);

  const hasDirtyForms = useCallback(() => {
    return Object.keys(dirtyForms).some((id) => dirtyForms[id]?.isDirty);
  }, [dirtyForms]);

  const getDirtyFormNames = useCallback(() => {
    return Object.entries(dirtyForms)
      .filter(([, state]) => state.isDirty)
      .map(([, state]) => state.formName);
  }, [dirtyForms]);

  const clearAll = useCallback(() => {
    setDirtyForms({});
  }, []);

  return (
    <FormDirtyContext.Provider
      value={{
        dirtyForms,
        markDirty,
        markClean,
        hasDirtyForms,
        getDirtyFormNames,
        clearAll,
      }}
    >
      {children}
    </FormDirtyContext.Provider>
  );
}

export function useFormDirty() {
  const context = useContext(FormDirtyContext);
  if (!context) {
    throw new Error("useFormDirty must be used within a FormDirtyProvider");
  }
  return context;
}