"use client";

import { useEffect } from "react";
import { useFormDirty } from "@/context/FormDirtyContext";

/**
 * Hook to register a form's dirty state with the global FormDirtyContext.
 *
 * Usage:
 * ```tsx
 * function MyForm() {
 *   const [value, setValue] = useState("");
 *   const { isDirty } = useFormState(); // or form.formState.isDirty
 *
 *   // Register this form with the context
 *   useFormDirtyRegistration("my-form", "My Form Name", isDirty);
 *
 *   return <form>...</form>;
 * }
 * ```
 *
 * @param formId - Unique identifier for this form
 * @param formName - Human-readable name for display in warnings
 * @param isDirty - Whether the form has unsaved changes
 */
export function useFormDirtyRegistration(
  formId: string,
  formName: string,
  isDirty: boolean
) {
  const { markDirty, markClean } = useFormDirty();

  useEffect(() => {
    if (isDirty) {
      markDirty(formId, formName);
    } else {
      markClean(formId);
    }

    // Cleanup on unmount - mark as clean
    return () => {
      markClean(formId);
    };
  }, [formId, formName, isDirty, markDirty, markClean]);
}

/**
 * Hook to check if any forms have unsaved changes.
 * Useful before navigation or logout.
 *
 * Usage:
 * ```tsx
 * const { hasDirtyForms, getDirtyFormNames } = useDirtyFormsCheck();
 *
 * if (hasDirtyForms()) {
 *   const names = getDirtyFormNames();
 *   // Show warning with names
 * }
 * ```
 */
export function useDirtyFormsCheck() {
  const { hasDirtyForms, getDirtyFormNames, clearAll } = useFormDirty();

  return {
    hasDirtyForms,
    getDirtyFormNames,
    clearAll,
  };
}