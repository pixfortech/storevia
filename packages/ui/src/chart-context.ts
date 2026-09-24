// Shared by ChartCard and the charts inside it: which twin to show.
import { createContext } from "react";

export type ChartView = "chart" | "table";

/** Set by ChartCard's "View as table" toggle; charts render their table twin. */
export const ChartViewContext = createContext<ChartView>("chart");
