import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";

/** Polished placeholder for features planned in a later phase. */
export function ComingSoon({
  title,
  description,
  bullets,
}: {
  title: string;
  description: string;
  bullets: string[];
}) {
  return (
    <div>
      <PageHeader
        title={title}
        action={<Badge tone="warning">Coming in a future phase</Badge>}
      />
      <Card>
        <CardBody className="flex flex-col items-center gap-4 py-14 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <svg
              className="h-6 w-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 8v4l3 3M12 3a9 9 0 100 18 9 9 0 000-18z" />
            </svg>
          </div>
          <div className="max-w-md">
            <h2 className="text-base font-semibold text-slate-900">
              This feature is on the way
            </h2>
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          </div>
          <ul className="mx-auto max-w-sm space-y-2 text-left text-sm text-slate-600">
            {bullets.map((bullet) => (
              <li key={bullet} className="flex items-start gap-2">
                <span
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400"
                  aria-hidden="true"
                />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
