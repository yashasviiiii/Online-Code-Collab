/**
 * Global error boundary component for handling runtime errors.
 * Features:
 * - Error reporting
 * - Recovery options
 * - Development error details
 *
 */

"use client";

import { Geist, Geist_Mono } from "next/font/google";
import { Bug, RefreshCcw } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { REPO_URL } from "@/lib/constants";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const generateErrorReport = () => {
    const timestamp = new Date().toISOString();
    const errorMessage = `Error Details:
Time: ${timestamp}
Digest: ${error.digest || "No digest available"}
URL: ${window.location.href}`;

    return REPO_URL
      ? `${REPO_URL}/issues/new?body=${encodeURIComponent(errorMessage)}`
      : null;
  };

  return (
    <html className={`${geistSans.variable} ${geistMono.variable}`} lang="en">
      <body>
        <div className="flex min-h-screen flex-col items-center justify-center p-4">
          <Alert className="max-w-lg">
            <AlertTitle className="font-semibold text-xl">
              Critical Error
            </AlertTitle>
            <AlertDescription className="text-muted-foreground">
              A critical error has occurred. We apologize for the inconvenience.
              {error.digest && (
                <p className="mt-2 text-muted-foreground text-sm">
                  Error ID: {error.digest}
                </p>
              )}
            </AlertDescription>
            <div className="mt-6 flex flex-col justify-end gap-4 sm:flex-row">
              {generateErrorReport() && (
                <Button asChild className="gap-2" variant="outline">
                  <Link href={generateErrorReport() as Route} target="_blank">
                    <Bug className="size-4" />
                    Report Issue
                  </Link>
                </Button>
              )}
              <Button
                className="gap-2"
                onClick={() => reset()}
                variant="default"
              >
                <RefreshCcw className="size-4" />
                Reload Application
              </Button>
            </div>
          </Alert>
        </div>
      </body>
    </html>
  );
}
