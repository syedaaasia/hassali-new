"use client";
import { create } from "zustand";
export type ProductArea = "chat" | "growth";
export const useProductAreaStore = create<{ area: ProductArea; setArea: (area: ProductArea) => void }>((set) => ({ area: "chat", setArea: (area) => set({ area }) }));
