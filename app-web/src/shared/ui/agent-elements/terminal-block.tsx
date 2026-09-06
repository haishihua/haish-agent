// Adapted from assistant-ui Elements (MIT). See LICENSE-assistant-ui.txt.
"use client";

import type { ComponentProps } from "react";
import { CheckIcon, Loader2Icon, XIcon, MinusIcon } from "lucide-react";
const cn = (...values: (string | false | undefined)[]) => values.filter(Boolean).join(" ");
import { mono, paper } from "./surfaces";
const take = <T,>(items: readonly T[], count: number) => items.slice(0, Math.max(0, Math.min(items.length, Number.isFinite(count) ? Math.floor(count) : 0)));

export function TerminalBlock({
  command,
  lines,
  visibleCount,
  done,
  exitCode,
  failed = false,
  stderr,
  cwd,
  variant = "paper",
  className,
  ...props
}: Omit<
  ComponentProps<"div">,
  "children" | "command" | "lines" | "visibleCount" | "done" | "variant"
> & {
  command: string;
  lines: readonly string[];
  visibleCount: number;
  done: boolean;
  exitCode?: string | number;
  failed?: boolean;
  stderr?: string;
  cwd?: string;
  variant?: "paper" | "ink";
}) {
  const ink = variant === "ink";

  return (
    <div
      data-slot="terminal-block"
      className={cn(
        ink ? "bg-foreground dark:bg-popover" : paper,
        "w-full max-w-md overflow-hidden rounded-2xl font-mono text-xs",
        className,
      )}

      {...props}
    >
      {cwd ? <div className="px-4 pt-3 text-foreground/50">{cwd}</div> : null}
      <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-1.5">
        <span
          className={cn(
            ink
              ? "text-background/90 dark:text-foreground/90"
              : "text-foreground/90",
          )}
        >
          <span className="break-all">{command}</span>
        </span>
        {done ? (
          <div className="flex items-center gap-1">
            {failed ? <XIcon className="size-3 text-red-400" /> : Number(exitCode) === 0 && exitCode !== "" && exitCode != null ? <CheckIcon className="size-3 text-emerald-500" /> : <MinusIcon className="size-3" />}
            <span
              className={cn(
                mono,
                ink
                  ? "text-background/40 dark:text-foreground/40"
                  : "text-foreground/40",
              )}
            >
              {exitCode != null && exitCode !== "" ? `exit ${exitCode}` : failed ? "Failed" : "Finished"}
            </span>
          </div>
        ) : (
          <Loader2Icon
            className={cn(
              "size-3 animate-spin motion-reduce:animate-none",
              ink
                ? "text-background/35 dark:text-foreground/35"
                : "text-foreground/35",
            )}
          />
        )}
      </div>
      <div
        data-terminal-output
        className={cn(
          "flex min-h-[8.5rem] flex-col gap-1 px-4 pt-1 pb-3.5",
          ink
            ? "text-background/55 dark:text-foreground/50"
            : "text-foreground/50",
        )}
      >
        {take(lines, visibleCount).map((line, i) => {
          const isLast = i === lines.length - 1;
          return (
            <div
              key={`${i}-${line}`}
              className={cn(
                "fade-in animate-in fill-mode-both duration-300",
                isLast &&
                  (ink
                    ? "text-background/90 dark:text-foreground/90"
                    : "text-foreground/90"),
              )}
            >
              <span className="whitespace-pre-wrap break-all">{line || "\u00a0"}</span>
            </div>
          );
        })}
        {stderr ? <pre className="whitespace-pre-wrap break-all text-red-400" aria-label="stderr">{stderr}</pre> : null}
        {!done && (
          <span
            aria-hidden
            className="inline-block h-3 w-1.5 animate-pulse bg-blue-500/70 motion-reduce:animate-none dark:bg-blue-400/70"
          />
        )}
      </div>
    </div>
  );
}
