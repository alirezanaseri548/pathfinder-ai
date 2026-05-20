"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import {
  LayoutDashboard,
  FileText,
  Bot,
  PenBox,
  GraduationCap,
  ChevronDown,
  StarsIcon,
} from "lucide-react";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ModeToggle } from "./ui/Modetoggle";
import { useTheme } from "next-themes";
import { getUserOnboardingStatus } from "@/actions/user"; // server action

export default function Header() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const [clerkKeyless, setClerkKeyless] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    // Check dev status endpoint to detect Clerk keyless mode and show a banner
    let mounted = true;
    fetch('/api/dev/status')
      .then((res) => res.json())
      .then((data) => {
        if (mounted && data?.clerkKeyless) setClerkKeyless(true);
      })
      .catch(() => {});
    return () => (mounted = false);
  }, []);

  const logoSrc = mounted && resolvedTheme === "dark" ? "/white-logo.png" : "/logo.png";

  /** guarded navigation */
  const go = async (href) => {
    if (!isSignedIn) return router.push("/sign-in");

    try {
      const { isOnboarded } = await getUserOnboardingStatus();
      router.push(isOnboarded ? href : "/onboarding");
    } catch (err) {
      console.error("Onboarding check failed:", err);
      router.push(href);
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      {clerkKeyless && (
        <div className="w-full bg-yellow-100 text-yellow-800 text-sm py-1 text-center">
          Clerk running in keyless dev mode — auth is disabled locally.
        </div>
      )}
      <nav className="container mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/">
          <Image
            src={logoSrc}
            alt="Pathfinder AI Logo"
            width={500}
            height={100}
            className="h-12 w-auto object-contain"
            priority
          />
        </Link>

        <ModeToggle />

        <div className="flex items-center space-x-2 md:space-x-4">
          {/* -------- Signed-in navigation -------- */}
          <SignedIn>
            {/* Dashboard button */}
            <Button
              variant="outline"
              className="hidden md:inline-flex items-center gap-2"
              onClick={() => go("/dashboard")}
            >
              <LayoutDashboard className="h-4 w-4" />
              Industry Insights
            </Button>
            <Button
              variant="ghost"
              className="md:hidden w-10 h-10 p-0"
              onClick={() => go("/dashboard")}
            >
              <LayoutDashboard className="h-4 w-4" />
            </Button>

            {/* Growth Tools dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="flex items-center gap-2">
                  <StarsIcon className="h-4 w-4" />
                  <span className="hidden md:block">Growth Tools</span>
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={() => go("/resume")}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <FileText className="h-4 w-4" />
                  Build Resume
                </DropdownMenuItem>

                <DropdownMenuItem
                  onClick={() => go("/ai-cover-letter")}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <PenBox className="h-4 w-4" />
                  Cover Letter
                </DropdownMenuItem>

                <DropdownMenuItem
                  onClick={() => go("/interview")}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <GraduationCap className="h-4 w-4" />
                  Interview Prep
                </DropdownMenuItem>

                <DropdownMenuItem
                  onClick={() => go("/ai-assistant")}
                  className="flex items-center gap-2 cursor-pointer"
                >
                  <Bot className="h-4 w-4" />
                  AI Assistant
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SignedIn>

          {/* -------- Signed-out button -------- */}
          <SignedOut>
            <SignInButton>
              <Button variant="outline">Sign&nbsp;In</Button>
            </SignInButton>
          </SignedOut>

          {/* -------- Avatar -------- */}
          <SignedIn>
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "w-10 h-10",
                  userButtonPopoverCard: "shadow-xl",
                  userPreviewMainIdentifier: "font-semibold",
                },
              }}
              afterSignOutUrl="/"
            />
          </SignedIn>
        </div>
      </nav>
    </header>
  );
}
