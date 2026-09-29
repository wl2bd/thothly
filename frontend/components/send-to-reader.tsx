"use client";

import { useState, useSyncExternalStore } from "react";
import { ChevronDownIcon, ExternalLinkIcon, Share2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// There is no one standard for getting a book onto an e-reader, so this offers
// the paths that exist: the device's own share sheet (phones and tablets:
// Kindle, Apple Books, Kobo, Play Books apps…), Amazon's official Send to
// Kindle page, and plain instructions for everything else.
const KINDLE_URL = "https://www.amazon.com/sendtokindle";

// File sharing is a phone/tablet capability; the item only appears where the
// browser can actually hand a file to the system share sheet.
function canShareFiles() {
  try {
    return (
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [new File([""], "book.epub", { type: "application/epub+zip" })] })
    );
  } catch {
    return false;
  }
}
const noSubscribe = () => () => {};

export function SendToReader({ epubUrl, title }: { epubUrl: string; title: string }) {
  const shareable = useSyncExternalStore(noSubscribe, canShareFiles, () => false);
  const [help, setHelp] = useState(false);

  async function share() {
    try {
      const blob = await (await fetch(epubUrl)).blob();
      const name = `${title.trim() || "compilation"}.epub`;
      await navigator.share({
        files: [new File([blob], name, { type: "application/epub+zip" })],
        title,
      });
    } catch {
      /* dismissed or blocked; Download remains */
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" />}>
          Send to
          <ChevronDownIcon className="text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {shareable && (
            <>
              <DropdownMenuItem onClick={share} className="py-2">
                <Share2Icon />
                Share…
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem
            className="py-2"
            render={<a href={KINDLE_URL} target="_blank" rel="noreferrer" />}
          >
            Kindle
            <ExternalLinkIcon className="text-muted-foreground ml-auto" />
          </DropdownMenuItem>
          <DropdownMenuItem className="py-2" onClick={() => setHelp(true)}>
            Kobo and other e-readers
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent className="gap-5 p-6 sm:max-w-md">
          <DialogHeader className="pr-8">
            <DialogTitle>Put the EPUB on your e-reader</DialogTitle>
            <DialogDescription>Download it first, then:</DialogDescription>
          </DialogHeader>
          <dl className="flex flex-col gap-4 text-sm">
            <div>
              <dt className="font-medium">Kobo</dt>
              <dd className="text-muted-foreground">
                Save it to the Dropbox or Google Drive linked to your Kobo, or copy
                it over USB.
              </dd>
            </div>
            <div>
              <dt className="font-medium">PocketBook, Boox, reMarkable</dt>
              <dd className="text-muted-foreground">
                Each has its own send-by-email address or app, set up in the
                device&apos;s settings. USB works on all of them.
              </dd>
            </div>
            <div>
              <dt className="font-medium">Any e-reader over USB</dt>
              <dd className="text-muted-foreground">
                Plug it in and drop the file into its books folder.
              </dd>
            </div>
          </dl>
        </DialogContent>
      </Dialog>
    </>
  );
}
