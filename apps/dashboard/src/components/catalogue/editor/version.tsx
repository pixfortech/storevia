"use client";

import { createContext, useContext } from "react";

/**
 * The product's saves on this page (media, variants, options, status) each
 * move its updatedAt. They report the new value here so the details form
 * sends the newest version it caused, and only someone else's save counts
 * as a conflict.
 */
export const ProductVersionContext = createContext<(updatedAt: string) => void>(() => undefined);

export const useNoteVersion = () => useContext(ProductVersionContext);
