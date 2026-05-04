"use client";

export type PrivateSessionCloseSummary = {
  spentMinutes?: number;
  remainingMinutes?: number | null;
  earnedMinutes?: number | null;
};

type PrivateSessionEndedSummaryProps = {
  role: "viewer" | "streamer";
  resultText: string;
  summary: PrivateSessionCloseSummary | null;
};

/**
 * Post-session UX block shown when the session panel is unmounted. Keeps `private-session-result`
 * in the DOM (visually hidden) for existing Playwright assertions on the legacy string.
 */
export default function PrivateSessionEndedSummary({ role, resultText, summary }: PrivateSessionEndedSummaryProps) {
  if (!resultText) {
    return null;
  }

  const spent = summary?.spentMinutes;
  const remaining = summary?.remainingMinutes;
  const earned = summary?.earnedMinutes;

  const showViewerLines = role === "viewer" && (typeof spent === "number" || typeof remaining === "number");
  const showStreamerEarned = role === "streamer" && typeof earned === "number";

  return (
    <div
      className="mb-3 mt-2 space-y-1 rounded-xl border border-violet-100 bg-violet-50/60 px-3 py-3 text-xs text-violet-900"
      data-testid="private-session-summary"
    >
      <p className="font-semibold text-violet-900">Özel oda kapatıldı.</p>
      {showViewerLines ? (
        <>
          {typeof spent === "number" ? <p className="text-violet-800">Harcanan süre: {spent} dk</p> : null}
          {typeof remaining === "number" ? <p className="text-violet-800">Kalan dakika: {remaining} dk</p> : null}
        </>
      ) : null}
      {showStreamerEarned ? <p className="text-violet-800">Yayıncı kazancı: {earned} dk</p> : null}
      <p className="sr-only" data-testid="private-session-result">
        {resultText}
      </p>
    </div>
  );
}
