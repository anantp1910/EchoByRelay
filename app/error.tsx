"use client";

import { RotateCcw, TriangleAlert } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-3 px-4 py-20 text-center">
      <TriangleAlert aria-hidden className="size-8 text-block" />
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="text-muted-foreground">{error.message || "This screen hit an unexpected error."}</p>
      <div className="mt-2 flex gap-2">
        <Button onClick={reset}>
          <RotateCcw aria-hidden /> Try again
        </Button>
        <Button variant="outline" render={<Link href="/" />} nativeButton={false}>
          Home
        </Button>
      </div>
    </main>
  );
}
