import { Anton, Figtree, Inter } from "next/font/google";

// Echo type system (reference-inspired): Figtree Light for display, Inter for
// text, Anton only for the giant condensed wordmark. Used by the landing and
// /signin via the `.echo` scope; portals switch in their own phase.
export const figtree = Figtree({ variable: "--font-figtree", subsets: ["latin"], weight: ["300", "400", "500"] });
export const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
export const anton = Anton({ variable: "--font-anton", subsets: ["latin"], weight: "400" });

export const echoFonts = `${figtree.variable} ${inter.variable} ${anton.variable}`;
