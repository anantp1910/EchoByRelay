import { echoFonts } from "@/app/fonts";
import { Capabilities } from "@/components/landing/Capabilities";
import { Footer } from "@/components/landing/Footer";
import { PathBand } from "@/components/landing/PathBand";
import { People } from "@/components/landing/People";
import { TravelingPill } from "@/components/landing/pill/TravelingPill";
import { PillNav } from "@/components/landing/PillNav";
import { Portals } from "@/components/landing/Portals";
import { StickyStory } from "@/components/landing/StickyStory";
import { TryEcho } from "@/components/landing/TryEcho";
import { WordmarkHero } from "@/components/landing/WordmarkHero";

export default function Home() {
  return (
    // overflow-x-clip (not hidden) so the sticky storyboard keeps working.
    <div className={`echo ${echoFonts} flex-1 overflow-x-clip bg-background text-foreground`}>
      <PillNav />
      <TravelingPill />
      <main>
        <WordmarkHero />
        <People />
        <PathBand />
        <Capabilities />
        <StickyStory />
        <Portals />
        <TryEcho />
      </main>
      <Footer />
    </div>
  );
}
